export interface TelemetryPayload {
    t: number;
    r: number;
    v: number;
    c: number;
}

export interface PdMState {
    smoothedVibration: number;
    degradationSlope: number;
    estimatedRUL: number;
}
