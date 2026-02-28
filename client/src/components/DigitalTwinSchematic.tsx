import { forwardRef, useImperativeHandle, useRef } from 'react';

import type { TwinNodeState, TwinNodeLimits } from '../types/telemetry';
import { RPM_LIMITS, VIB_LIMITS, TEMP_LIMITS } from '../config/thresholds';

export interface DigitalTwinSchematicHandle {
    updateBearingState: (state: TwinNodeState) => void;
    updateRpmValue: (val: number) => void;
    updateVibValue: (val: number) => void;
    updateTempValue: (val: number) => void;
}

// ─── Constants ───────────────────────────────────────────────

const NODE_COLORS: Record<TwinNodeState, { bg: string; border: string; text: string }> = {
    nominal: { bg: '#0f172a', border: '#334155', text: '#94a3b8' },
    warning: { bg: '#451a03', border: '#f59e0b', text: '#f59e0b' },
    critical: { bg: '#450a0a', border: '#ef4444', text: '#ef4444' },
    failure: { bg: '#7f1d1d', border: '#dc2626', text: '#fca5a5' },
};

// ─── Helpers ─────────────────────────────────────────────────

function getFillPercent(val: number, limits: TwinNodeLimits): number {
    const clamped = Math.max(limits.min, Math.min(val, limits.max));
    return ((clamped - limits.min) / (limits.max - limits.min)) * 100;
}

function getFillColor(val: number, limits: TwinNodeLimits): string {
    if (val >= limits.critical) return '#ef4444';
    if (val >= limits.warning) return '#f59e0b';
    return '#475569';
}

// ─── Bullet Graph Sub-Component (inline element) ─────────────

interface BulletRefs {
    textRef: React.RefObject<HTMLSpanElement | null>;
    fillRef: React.RefObject<HTMLDivElement | null>;
}

function BulletGraph({ label, unit, limits, refs }: {
    label: string;
    unit: string;
    limits: TwinNodeLimits;
    refs: BulletRefs;
}): React.ReactElement {
    // Calculate warning/critical marker positions
    const warnPct = ((limits.warning - limits.min) / (limits.max - limits.min)) * 100;
    const critPct = ((limits.critical - limits.min) / (limits.max - limits.min)) * 100;

    return (
        <div style={{ width: '100%', padding: '0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                <span className="twin-node-label" style={{ margin: 0 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                    <span ref={refs.textRef} className="twin-node-value tabular-data" style={{ fontSize: '13px' }}>--</span>
                    <span className="twin-node-unit" style={{ margin: 0 }}>{unit}</span>
                </div>
            </div>
            {/* Bullet Track */}
            <div style={{
                position: 'relative',
                width: '100%',
                height: '12px',
                background: '#1e293b',
                borderRadius: '3px',
                overflow: 'visible',
            }}>
                {/* Fill Bar */}
                <div
                    ref={refs.fillRef}
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: '0%',
                        background: '#475569',
                        borderRadius: '3px',
                        transition: 'background-color 0.3s ease',
                    }}
                />
                {/* Warning marker */}
                <div style={{
                    position: 'absolute',
                    left: `${warnPct}%`,
                    top: '-1px',
                    width: '1px',
                    height: '14px',
                    background: '#f59e0b',
                    opacity: 0.6,
                }} />
                {/* Critical marker */}
                <div style={{
                    position: 'absolute',
                    left: `${critPct}%`,
                    top: '-1px',
                    width: '1px',
                    height: '14px',
                    background: '#ef4444',
                    opacity: 0.6,
                }} />
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────

export const DigitalTwinSchematic = forwardRef<DigitalTwinSchematicHandle>(
    (_props, ref) => {
        const bearingNodeRef = useRef<HTMLDivElement>(null);
        const bearingStatusRef = useRef<HTMLSpanElement>(null);

        // Bullet graph refs
        const rpmTextRef = useRef<HTMLSpanElement>(null);
        const rpmFillRef = useRef<HTMLDivElement>(null);
        const vibTextRef = useRef<HTMLSpanElement>(null);
        const vibFillRef = useRef<HTMLDivElement>(null);
        const tempTextRef = useRef<HTMLSpanElement>(null);
        const tempFillRef = useRef<HTMLDivElement>(null);

        // Combustor node ref for thermal runaway coloring
        const combustorNodeRef = useRef<HTMLDivElement>(null);

        useImperativeHandle(ref, () => ({
            updateBearingState: (state: TwinNodeState) => {
                const colors = NODE_COLORS[state];
                if (bearingNodeRef.current) {
                    bearingNodeRef.current.style.backgroundColor = colors.bg;
                    bearingNodeRef.current.style.borderColor = colors.border;
                    bearingNodeRef.current.style.boxShadow = state === 'nominal'
                        ? 'none'
                        : `0 0 20px ${colors.border}40, inset 0 0 20px ${colors.border}10`;
                    bearingNodeRef.current.classList.toggle('fault-pulse', state === 'failure');
                }
                if (bearingStatusRef.current) {
                    bearingStatusRef.current.innerText = state.toUpperCase();
                    bearingStatusRef.current.style.color = colors.text;
                }
            },

            updateRpmValue: (val: number) => {
                if (rpmTextRef.current) rpmTextRef.current.innerText = val.toFixed(0);
                if (rpmFillRef.current) {
                    rpmFillRef.current.style.width = `${getFillPercent(val, RPM_LIMITS)}%`;
                    rpmFillRef.current.style.backgroundColor = getFillColor(val, RPM_LIMITS);
                }
            },

            updateVibValue: (val: number) => {
                const absVal = Math.abs(val);
                if (vibTextRef.current) vibTextRef.current.innerText = absVal.toFixed(2);
                if (vibFillRef.current) {
                    vibFillRef.current.style.width = `${getFillPercent(absVal, VIB_LIMITS)}%`;
                    vibFillRef.current.style.backgroundColor = getFillColor(absVal, VIB_LIMITS);
                }
            },

            updateTempValue: (val: number) => {
                if (tempTextRef.current) tempTextRef.current.innerText = val.toFixed(1);
                if (tempFillRef.current) {
                    tempFillRef.current.style.width = `${getFillPercent(val, TEMP_LIMITS)}%`;
                    tempFillRef.current.style.backgroundColor = getFillColor(val, TEMP_LIMITS);
                }
                // Also color the combustor node border if temp exceeds thresholds
                if (combustorNodeRef.current) {
                    if (val >= TEMP_LIMITS.critical) {
                        combustorNodeRef.current.style.borderColor = '#ef4444';
                        combustorNodeRef.current.style.boxShadow = '0 0 20px #ef444440';
                    } else if (val >= TEMP_LIMITS.warning) {
                        combustorNodeRef.current.style.borderColor = '#f59e0b';
                        combustorNodeRef.current.style.boxShadow = '0 0 20px #f59e0b40';
                    } else {
                        combustorNodeRef.current.style.borderColor = '#334155';
                        combustorNodeRef.current.style.boxShadow = 'none';
                    }
                }
            },
        }));

        return (
            <div className="twin-container">
                {/* Header */}
                <div className="hmi-panel-header">
                    <span className="hmi-panel-title">System Overview — Gas Turbine</span>
                </div>

                {/* Schematic Body */}
                <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>

                    {/* Main Flow Diagram */}
                    <div className="twin-flow-layout">

                        {/* Intake */}
                        <div className="twin-node twin-node-intake">
                            <span className="twin-node-label">Intake</span>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#475569' }}>
                                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        {/* Compressor */}
                        <div className="twin-node twin-node-core">
                            <BulletGraph
                                label="Compressor"
                                unit="RPM"
                                limits={RPM_LIMITS}
                                refs={{ textRef: rpmTextRef, fillRef: rpmFillRef }}
                            />
                        </div>

                        {/* Combustor */}
                        <div
                            ref={combustorNodeRef}
                            className="twin-node twin-node-core"
                            style={{ transition: 'border-color 0.5s ease, box-shadow 0.5s ease' }}
                        >
                            <BulletGraph
                                label="Combustor"
                                unit="°C"
                                limits={TEMP_LIMITS}
                                refs={{ textRef: tempTextRef, fillRef: tempFillRef }}
                            />
                        </div>

                        {/* Turbine / Bearing */}
                        <div
                            ref={bearingNodeRef}
                            className="twin-node twin-node-core"
                            style={{
                                backgroundColor: NODE_COLORS.nominal.bg,
                                borderColor: NODE_COLORS.nominal.border,
                            }}
                        >
                            <BulletGraph
                                label="Turbine"
                                unit="mm/s"
                                limits={VIB_LIMITS}
                                refs={{ textRef: vibTextRef, fillRef: vibFillRef }}
                            />
                            <span
                                ref={bearingStatusRef}
                                className="twin-node-status"
                                style={{ color: NODE_COLORS.nominal.text, marginTop: '4px' }}
                            >
                                NOMINAL
                            </span>
                        </div>

                        {/* Exhaust */}
                        <div className="twin-node twin-node-exhaust">
                            <span className="twin-node-label">Exhaust</span>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#475569' }}>
                                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </div>

                    {/* Shaft Line */}
                    <div className="shaft-line-container">
                        <div className="shaft-line-left"></div>
                        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
                            Drive Shaft
                        </span>
                        <div className="shaft-line-right"></div>
                    </div>
                </div>
            </div>
        );
    }
);

DigitalTwinSchematic.displayName = 'DigitalTwinSchematic';
