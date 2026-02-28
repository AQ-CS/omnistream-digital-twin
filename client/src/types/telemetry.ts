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

// WebSocket Supervisor States
export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'STALE' | 'DISCONNECTED';

// ─── Shared Configurations ───────────────────────────────────

export type TwinNodeState = 'nominal' | 'warning' | 'critical' | 'failure';

export interface TwinNodeLimits {
    min: number;
    max: number;
    warning: number;
    critical: number;
}

export interface ChartConfig {
    label: string;
    stroke: string;
    secondaryStroke?: string;
    yMin?: number;
    yMax?: number;
    warningLimit?: number;
    criticalLimit?: number;
}
