import type { ChartConfig, TwinNodeLimits } from '../types/telemetry';

// ─── Value Thresholds ────────────────────────────────────────

export const RPM_LIMITS: TwinNodeLimits = { min: 3400, max: 3900, warning: 3700, critical: 3800 };

// ISO 20816-4 Standards for Heavy-Duty Gas Turbines
export const VIB_LIMITS: TwinNodeLimits = { min: 0, max: 15, warning: 7.1, critical: 11.2 };

export const TEMP_LIMITS: TwinNodeLimits = { min: 860, max: 970, warning: 940, critical: 955 };

// Warning at 16s (aligns roughly with the 7.1 vibration threshold).
// Critical at 5s (Gives the operator 5 seconds to hit the E-Stop before RUL hits 0 and the machine breaks).
export const RUL_LIMITS: TwinNodeLimits = { min: 0, max: 999, warning: 16, critical: 5 };

export const RPM_CONFIG: ChartConfig = {
    label: 'RPM', stroke: '#38bdf8', yMin: 3450, yMax: 3850, warningLimit: 3700, criticalLimit: 3800,
};

export const VIB_CONFIG: ChartConfig = {
    label: 'Vibration', stroke: '#94a3b8', secondaryStroke: '#818cf8', yMin: -2, yMax: 16, warningLimit: 7.1, criticalLimit: 11.2,
};

export const TEMP_CONFIG: ChartConfig = {
    label: 'Temp °C', stroke: '#818cf8', yMin: 870, yMax: 970, warningLimit: 940, criticalLimit: 955,
};