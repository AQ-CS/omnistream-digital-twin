// ─── PdM Web Worker ──────────────────────────────────────────
import type { FleetPdMState, PdMState } from '../types/telemetry';
import { VIB_LIMITS, TEMP_LIMITS } from '../config/thresholds';

export interface PdMWorkerInput {
    updates: { id: string; timestamp: number; vibration: number; temperature: number }[];
}

export interface PdMWorkerOutput {
    states: FleetPdMState;
}

// ─── Math ────────────────────────────────────────────────────
function calculateEMA(current: number, previous: number | null, alpha: number): number {
    if (previous === null) return current;
    return (current * alpha) + (previous * (1 - alpha));
}

function calculateLinearRegression(
    yBuf: Float64Array,
    head: number,
    count: number,
    capacity: number
): number {
    // 10-second sliding window for sandbox responsiveness
    const N = Math.min(count, 10);
    if (N < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const start = (head - N + capacity) % capacity;

    for (let i = 0; i < N; i++) {
        const idx = (start + i) % capacity;
        const x = i; // Strict 1Hz integer seconds
        const y = yBuf[idx];

        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    const xMean = sumX / N;
    const yMean = sumY / N;
    const num = sumXY - (N * xMean * yMean);
    const den = sumX2 - (N * xMean * xMean);

    return den === 0 ? 0 : num / den;
}

function calculateRUL(current: number, slope: number, threshold: number): number {
    if (current >= threshold) return 0;
    if (current < 4.0) return 999;
    if (slope <= 0.01) return 999;

    const rulSeconds = (threshold - current) / slope;
    return rulSeconds > 120 ? 999 : rulSeconds;
}

// ─── Worker State ────────────────────────────────────────────
const BUFFER_SIZE = 250;
const RAW_BUFFER_SIZE = 50;

class TurbineState {
    public vibBuffer = new Float64Array(RAW_BUFFER_SIZE);
    public vibHead = 0;
    public vibCount = 0;
    public pointsSinceLastProcess = 0;

    public trendEmaBuffer = new Float64Array(BUFFER_SIZE);
    public trendHead = 0;
    public trendCount = 0;

    public lastEMA: number | null = null;
    public lastTempEMA: number | null = null;

    public rulBuffer = new Float64Array(3).fill(999);
    public rulHead = 0;

    public currentPdM: PdMState = {
        smoothedVibration: 0,
        degradationSlope: 0,
        estimatedRUL: 999,
        smoothedTemperature: 0,
        temperatureStatus: 'nominal'
    };

    pushVib(value: number): void {
        this.vibBuffer[this.vibHead % RAW_BUFFER_SIZE] = value;
        this.vibHead++;
        if (this.vibCount < RAW_BUFFER_SIZE) this.vibCount++;
        this.pointsSinceLastProcess++;
    }

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

    pushTrend(ema: number): void {
        const idx = this.trendHead % BUFFER_SIZE;
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

// ─── Main Loop ───────────────────────────────────────────────
self.onmessage = (e: MessageEvent<PdMWorkerInput>): void => {
    const { updates } = e.data;
    const responseMap: FleetPdMState = {};

    for (const update of updates) {
        const state = getTurbine(update.id);
        const { vibration, temperature } = update;

        state.pushVib(vibration);

        if (state.vibCount >= RAW_BUFFER_SIZE && state.pointsSinceLastProcess >= RAW_BUFFER_SIZE) {
            state.pointsSinceLastProcess = 0;

            const peakAmplitude = state.peakVib();
            const ema = calculateEMA(peakAmplitude, state.lastEMA, 0.1);
            state.lastEMA = ema;

            state.pushTrend(ema);

            let slope = 0;
            let rawRul = 999;

            if (state.trendCount >= 5) {
                slope = calculateLinearRegression(
                    state.trendEmaBuffer,
                    state.trendHead,
                    state.trendCount,
                    BUFFER_SIZE
                );

                rawRul = calculateRUL(ema, slope, VIB_LIMITS.critical);
            }

            if (rawRul === 0) {
                state.rulBuffer.fill(0);
            } else if (rawRul === 999) {
                state.rulBuffer.fill(999);
            } else {
                state.rulBuffer[state.rulHead % 3] = rawRul;
                state.rulHead++;
            }

            let smoothedRul = rawRul;
            if (rawRul !== 0 && rawRul !== 999) {
                const sorted = [state.rulBuffer[0], state.rulBuffer[1], state.rulBuffer[2]].sort((a, b) => a - b);
                smoothedRul = sorted[1];
            }

            const tempEma = calculateEMA(temperature, state.lastTempEMA, 0.05);
            state.lastTempEMA = tempEma;

            let tempStatus: 'nominal' | 'warning' | 'critical' = 'nominal';
            if (tempEma >= TEMP_LIMITS.critical) tempStatus = 'critical';
            else if (tempEma >= TEMP_LIMITS.warning) tempStatus = 'warning';

            // --- DEBUG LOGGING ---
            if (update.id === 'T-01') {
                console.log(
                    `[${update.id}] 1Hz Tick:\n` +
                    `  Vib (EMA): ${ema.toFixed(3)}\n` +
                    `  Slope/Sec: ${slope.toFixed(4)}\n` +
                    `  Raw RUL: ${rawRul.toFixed(2)}\n` +
                    `  Final RUL: ${smoothedRul.toFixed(2)}`
                );
            }
            // ---------------------

            state.currentPdM = {
                smoothedVibration: ema,
                degradationSlope: slope,
                estimatedRUL: smoothedRul,
                smoothedTemperature: tempEma,
                temperatureStatus: tempStatus
            };
        }

        responseMap[update.id] = state.currentPdM;
    }

    const output: PdMWorkerOutput = { states: responseMap };
    (self as unknown as Worker).postMessage(output);
};