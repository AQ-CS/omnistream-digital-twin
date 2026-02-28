// ─── PdM Web Worker ──────────────────────────────────────────
// Runs EMA, Linear Regression, and RUL off the main thread for all turbines.

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

function calculateLinearRegression(data: [number, number][]): number {
    const n = data.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const x = data[i][0];
        const y = data[i][1];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

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

// Maintain an isolated state slice for every multiplexed turbine
class TurbineState {
    public rawBuffer: number[] = [];
    public trendBuffer: [number, number][] = [];
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

        // Push into rolling buffer
        state.rawBuffer.push(vibration);
        if (state.rawBuffer.length > 50) state.rawBuffer.shift();

        // Need >=50 points (1 second) for meaningful regression
        if (state.rawBuffer.length >= 50) {
            // Find absolute maximum peak in the entire rolling buffer
            const peakAmplitude = Math.max(...state.rawBuffer.map(Math.abs));

            // 1. EMA
            const ema = calculateEMA(peakAmplitude, state.lastEMA, 0.1);
            state.lastEMA = ema;

            // Push the smoothed result to the trend buffer
            state.trendBuffer.push([timestamp, ema]);
            if (state.trendBuffer.length > BUFFER_SIZE) state.trendBuffer.shift();

            // 2. Linear Regression slope
            const slope = calculateLinearRegression(state.trendBuffer);

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
