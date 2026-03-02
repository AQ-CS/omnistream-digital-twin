import type { ChartConfig, TwinNodeLimits } from '../types/telemetry';

// ─── Value Thresholds ────────────────────────────────────────

// SGT-800 Nominal 6600 RPM
export const RPM_LIMITS: TwinNodeLimits = { min: 6400, max: 6800, warning: 6700, critical: 6750 };

// ISO 20816-4 Standards for Heavy-Duty Gas Turbines
export const VIB_LIMITS: TwinNodeLimits = { min: 0, max: 15, warning: 7.1, critical: 11.2 };

// SGT-800 Exhaust Temp Nominal 596°C
export const TEMP_LIMITS: TwinNodeLimits = { min: 550, max: 650, warning: 615, critical: 630 };

// Warning at 16s (aligns roughly with the 7.1 vibration threshold).
// Critical at 5s (Gives the operator 5 seconds to hit the E-Stop before RUL hits 0 and the machine breaks).
export const RUL_LIMITS: TwinNodeLimits = { min: 0, max: 999, warning: 16, critical: 5 };

// ─── Chart Rendering Configs ─────────────────────────────────

export const RPM_CONFIG: ChartConfig = {
    label: 'Turbine Speed (RPM)', stroke: '#38bdf8', yMin: 6500, yMax: 6800, warningLimit: 6700, criticalLimit: 6750,
};

export const VIB_CONFIG: ChartConfig = {
    label: 'Vibration', stroke: '#94a3b8', secondaryStroke: '#818cf8', yMin: -2, yMax: 16, warningLimit: 7.1, criticalLimit: 11.2,
};

export const TEMP_CONFIG: ChartConfig = {
    label: 'Exhaust Temp °C', stroke: '#818cf8', yMin: 580, yMax: 650, warningLimit: 615, criticalLimit: 630,
};