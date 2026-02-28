// ─── PdM Web Worker ──────────────────────────────────────────
// Runs EMA, Linear Regression, and RUL off the main thread for all turbines.
// Uses pre-allocated Float64Array circular buffers — zero dynamic allocations on the 50Hz hot path.

import type { FleetPdMState, PdMState } from '../types/telemetry';

// ─── Types ───────────────────────────────────────────────────

export interface PdMWorkerInput {
    // Main thread sends an array of [timestamp, vibration, temperature] per turbine
    updates: { id: string; timestamp: number; vibration: number; temperature: number }[];
}

export interface PdMWorkerOutput {
    states: FleetPdMState;
}

// ─── Inline Math (no imports in workers) ─────────────────────

function calculateEMA(current: number, previous: number | null, alpha: number): number {
    if (previous === null) return current;
    return (current * alpha) + (previous * (1 - alpha));
}

/**
 * Linear regression on a Float64Array circular buffer.
 * Iterates using (start + i) % capacity to avoid creating temporary arrays.
 */
function calculateLinearRegressionTyped(
    xBuf: Float64Array,
    yBuf: Float64Array,
    head: number,
    count: number,
    capacity: number
): number {
    if (count < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const start = (head - count + capacity) % capacity;

    for (let i = 0; i < count; i++) {
        const idx = (start + i) % capacity;
        const x = xBuf[idx];
        const y = yBuf[idx];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    const n = count;
    const xMean = sumX / n;
    const yMean = sumY / n;
    const num = sumXY - (n * xMean * yMean);
    const den = sumX2 - (n * xMean * xMean);
    return den === 0 ? 0 : num / den;
}

function calculateRUL(current: number, slope: number, threshold: number): number {
    const remaining = threshold - current;

    // 1. First, check if the machine is already dead
    if (remaining <= 0) return 0;

    // 2. Next, check if it's actually getting worse
    if (slope <= 0.05) return Infinity; // Stable or negligible degradation

    // 3. Finally, calculate the countdown
    return remaining / slope;
}

// ─── Worker State ────────────────────────────────────────────

const BUFFER_SIZE = 250; // 5 seconds at 50Hz
const RAW_BUFFER_SIZE = 50; // 1-second rolling window for peak detection

// Maintain an isolated state slice for every multiplexed turbine.
// All buffers pre-allocated on instantiation — no dynamic allocations during the hot path.
class TurbineState {
    // Raw vibration rolling window (1s = 50 samples)
    public vibBuffer = new Float64Array(RAW_BUFFER_SIZE);
    public vibHead = 0;
    public vibCount = 0;

    // Trend buffer for linear regression (5s = 250 samples)
    public trendTsBuffer = new Float64Array(BUFFER_SIZE);
    public trendEmaBuffer = new Float64Array(BUFFER_SIZE);
    public trendHead = 0;
    public trendCount = 0;

    // EMA state
    public lastEMA: number | null = null;

    // Thermal Tracking
    public lastTempEMA: number | null = null;

    public currentPdM: PdMState = {
        smoothedVibration: 0,
        degradationSlope: 0,
        estimatedRUL: Infinity,
        smoothedTemperature: 0,
        temperatureStatus: 'nominal'
    };

    /** Write a vibration sample into the circular raw buffer */
    pushVib(value: number): void {
        this.vibBuffer[this.vibHead % RAW_BUFFER_SIZE] = value;
        this.vibHead++;
        if (this.vibCount < RAW_BUFFER_SIZE) this.vibCount++;
    }

    /** Find peak absolute vibration in the raw buffer */
    peakVib(): number {
        let peak = 0;
        const n = this.vibCount;
        const start = (this.vibHead - n + RAW_BUFFER_SIZE) % RAW_BUFFER_SIZE;
        for (let i = 0; i < n; i++) {
            const v = Math.abs(this.vibBuffer[(start + i) % RAW_BUFFER_SIZE]);
            if (v > peak) peak = v;
        }
        return peak;
    }

    /** Write a trend sample (timestamp + EMA) into the circular trend buffer */
    pushTrend(ts: number, ema: number): void {
        const idx = this.trendHead % BUFFER_SIZE;
        this.trendTsBuffer[idx] = ts;
        this.trendEmaBuffer[idx] = ema;
        this.trendHead++;
        if (this.trendCount < BUFFER_SIZE) this.trendCount++;
    }
}

const fleet = new Map<string, TurbineState>();

function getTurbine(id: string): TurbineState {
    if (!fleet.has(id)) {
        fleet.set(id, new TurbineState());
    }
    return fleet.get(id)!;
}

// ─── Message Handler ─────────────────────────────────────────

self.onmessage = (e: MessageEvent<PdMWorkerInput>): void => {
    const { updates } = e.data;

    // We will build a batched response mapping IDs to their PdMState
    const responseMap: FleetPdMState = {};

    for (const update of updates) {
        const state = getTurbine(update.id);
        const { timestamp, vibration, temperature } = update;

        // Push into rolling circular buffer (index-based, no shift/push)
        state.pushVib(vibration);

        // Need >=50 points (1 second) for meaningful regression
        if (state.vibCount >= RAW_BUFFER_SIZE) {
            // Find absolute maximum peak in the entire rolling buffer
            const peakAmplitude = state.peakVib();

            // 1. EMA
            const ema = calculateEMA(peakAmplitude, state.lastEMA, 0.1);
            state.lastEMA = ema;

            // Push the smoothed result to the trend buffer (circular)
            state.pushTrend(timestamp, ema);

            // 2. Linear Regression slope (over typed arrays)
            const slope = calculateLinearRegressionTyped(
                state.trendTsBuffer,
                state.trendEmaBuffer,
                state.trendHead,
                state.trendCount,
                BUFFER_SIZE
            );

            // 3. RUL (critical threshold = 12.0 mm/s)
            const rul = calculateRUL(ema, slope, 12.0);

            // 4. Thermal
            const tempEma = calculateEMA(temperature, state.lastTempEMA, 0.05); // Slower smoothing for thermal
            state.lastTempEMA = tempEma;

            let tempStatus: 'nominal' | 'warning' | 'critical' = 'nominal';
            if (tempEma >= 960) tempStatus = 'critical';       // Thermal runaway critical threshold
            else if (tempEma >= 940) tempStatus = 'warning';   // High temp warning

            if (update.id === 'T-03') {
                console.log(`[Worker] ${update.id} | Peak: ${peakAmplitude.toFixed(2)} | EMA: ${ema.toFixed(3)} | Slope: ${slope.toFixed(6)} | RUL: ${rul.toFixed(1)} | Temp: ${tempEma.toFixed(1)} (${tempStatus})`);
            }

            state.currentPdM = {
                smoothedVibration: ema,
                degradationSlope: slope,
                estimatedRUL: rul,
                smoothedTemperature: tempEma,
                temperatureStatus: tempStatus
            };
        }

        responseMap[update.id] = state.currentPdM;
    }

    // Post the aggregated multi-turbine State map back to UI
    const output: PdMWorkerOutput = { states: responseMap };
    (self as unknown as Worker).postMessage(output);
};
