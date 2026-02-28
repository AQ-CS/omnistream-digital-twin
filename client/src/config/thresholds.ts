import type { ChartConfig, TwinNodeLimits } from '../types/telemetry';

// ─── Value Thresholds ────────────────────────────────────────

export const RPM_LIMITS: TwinNodeLimits = { min: 3400, max: 3900, warning: 3700, critical: 3800 };
export const VIB_LIMITS: TwinNodeLimits = { min: 0, max: 15, warning: 7.0, critical: 12.0 };
export const TEMP_LIMITS: TwinNodeLimits = { min: 860, max: 970, warning: 940, critical: 955 };
export const RUL_LIMITS: TwinNodeLimits = { min: 0, max: 999, warning: 60, critical: 30 };

// ─── Chart Rendering Configs ─────────────────────────────────

export const RPM_CONFIG: ChartConfig = {
    label: 'RPM', stroke: '#38bdf8', yMin: 3450, yMax: 3850, warningLimit: 3700, criticalLimit: 3800,
};

export const VIB_CONFIG: ChartConfig = {
    label: 'Vibration', stroke: '#94a3b8', secondaryStroke: '#818cf8', yMin: -5, yMax: 16, warningLimit: 7.0, criticalLimit: 12.0,
};

export const TEMP_CONFIG: ChartConfig = {
    label: 'Temp °C', stroke: '#818cf8', yMin: 870, yMax: 970, warningLimit: 940, criticalLimit: 955,
};
