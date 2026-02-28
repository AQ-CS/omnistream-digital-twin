export interface TelemetryPayload {
    id: string;
    t: number;
    r: number;
    v: number;
    c: number;
}

export interface PdMState {
    smoothedVibration: number;
    degradationSlope: number;
    estimatedRUL: number;
    smoothedTemperature: number;
    temperatureStatus: 'nominal' | 'warning' | 'critical';
}

// Multi-Turbine State 
export type FleetPdMState = Record<string, PdMState>;
