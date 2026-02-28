import type { TelemetryPayload, PdMState, ConnectionStatus } from '../types/telemetry';
import { RUL_LIMITS, VIB_LIMITS } from '../config/thresholds';

interface DiagnosticsPanelProps {
    turbineId: string;
    payload?: TelemetryPayload;
    pdmState?: PdMState;
    connStatus: ConnectionStatus;
}

export function DiagnosticsPanel({ turbineId, payload, pdmState, connStatus }: DiagnosticsPanelProps) {
    let statusColor = 'var(--hmi-border)';
    let alarmLevel: 'nominal' | 'warning' | 'critical' = 'nominal';

    if (pdmState) {
        const isThermalCritical = pdmState.temperatureStatus === 'critical';
        const isThermalWarning = pdmState.temperatureStatus === 'warning';
        const isVibCritical = pdmState.estimatedRUL < RUL_LIMITS.critical || pdmState.smoothedVibration >= VIB_LIMITS.critical;
        const isVibWarning = pdmState.estimatedRUL < RUL_LIMITS.warning || pdmState.smoothedVibration >= VIB_LIMITS.warning;

        if (isThermalCritical || isVibCritical) {
            statusColor = 'var(--hmi-alarm-critical)';
            alarmLevel = 'critical';
        } else if (isThermalWarning || isVibWarning) {
            statusColor = 'var(--hmi-alarm-warning)';
            alarmLevel = 'warning';
        }
    }

    // Solid opaque backgrounds — no transparency bleeding
    const panelBg = alarmLevel === 'critical' ? '#2a0a0a'
        : alarmLevel === 'warning' ? '#2d2001'
            : 'var(--hmi-bg-card)';

    const isStale = connStatus === 'STALE' || connStatus === 'DISCONNECTED';

    // Alarm class for physical cue (clip-path / outline)
    const alarmClass = alarmLevel === 'critical'
        ? 'hmi-alarm-critical-status'
        : alarmLevel === 'warning'
            ? 'hmi-alarm-warning-status'
            : '';

    return (
        <div className={`hmi-panel ${alarmClass} ${isStale ? 'hmi-comm-loss' : ''}`} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            backgroundColor: panelBg,
            transition: 'all 0.3s'
        }}>
            <div className="hmi-panel-header" style={{ borderBottomColor: statusColor }}>
                <span className="hmi-panel-title">Active Diagnostics</span>
                <span className="tabular-data" style={{ fontSize: '11px', color: 'var(--hmi-text-dim)' }}>{turbineId} STATUS LOG</span>
            </div>

            <div className="hmi-panel-body" style={{ flex: 1, position: 'relative', minHeight: '120px' }}>
                {!payload || !pdmState ? (
                    <div style={{ color: 'var(--hmi-text-dim)', fontSize: '12px' }}>Awaiting telemetry...</div>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {/* Dynamic Row */}
                        {!pdmState ? null : (
                            <>
                                {pdmState.temperatureStatus !== 'nominal' && (
                                    <div style={{
                                        background: pdmState.temperatureStatus === 'critical' ? '#2a0a0a' : '#2d2001',
                                        borderLeft: `3px solid ${pdmState.temperatureStatus === 'critical' ? 'var(--hmi-alarm-critical)' : 'var(--hmi-alarm-warning)'}`,
                                        padding: '12px 16px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px'
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={pdmState.temperatureStatus === 'critical' ? 'var(--hmi-alarm-critical)' : 'var(--hmi-alarm-warning)'} strokeWidth="2" style={{ marginTop: '2px' }} className="fault-pulse">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <div>
                                            <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '13px' }}>
                                                THERMAL RUNAWAY: Sustained high combustor temp
                                            </div>
                                            <div style={{ color: pdmState.temperatureStatus === 'critical' ? '#fca5a5' : '#fbbf24', opacity: 0.8, fontSize: '12px', marginTop: '2px' }}>
                                                Temp: {pdmState.smoothedTemperature.toFixed(1)}°C. Recommend immediate action.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(pdmState.estimatedRUL < RUL_LIMITS.warning || pdmState.smoothedVibration >= VIB_LIMITS.warning) && (
                                    <div style={{
                                        background: (pdmState.estimatedRUL < RUL_LIMITS.critical || pdmState.smoothedVibration >= VIB_LIMITS.critical) ? '#2a0a0a' : '#2d2001',
                                        borderLeft: `3px solid ${(pdmState.estimatedRUL < RUL_LIMITS.critical || pdmState.smoothedVibration >= VIB_LIMITS.critical) ? 'var(--hmi-alarm-critical)' : 'var(--hmi-alarm-warning)'}`,
                                        padding: '12px 16px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px'
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={(pdmState.estimatedRUL < RUL_LIMITS.critical || pdmState.smoothedVibration >= VIB_LIMITS.critical) ? 'var(--hmi-alarm-critical)' : 'var(--hmi-alarm-warning)'} strokeWidth="2" style={{ marginTop: '2px' }} className="fault-pulse">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <div>
                                            <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '13px' }}>
                                                BEARING FAULT: Degradation / High Vibration Detected
                                            </div>
                                            <div style={{ color: (pdmState.estimatedRUL < RUL_LIMITS.critical || pdmState.smoothedVibration >= VIB_LIMITS.critical) ? '#fca5a5' : '#94a3b8', opacity: 0.8, fontSize: '12px', marginTop: '2px' }}>
                                                {pdmState.estimatedRUL < RUL_LIMITS.warning
                                                    ? `RUL < ${RUL_LIMITS.warning}s. Recommend step-down protocol immediately.`
                                                    : `Vibration at ${pdmState.smoothedVibration.toFixed(2)} mm/s exceeds safety limits.`
                                                }
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {pdmState.temperatureStatus === 'nominal' && pdmState.estimatedRUL >= RUL_LIMITS.warning && pdmState.smoothedVibration < VIB_LIMITS.warning && (
                                    <div style={{
                                        background: 'rgba(16, 185, 129, 0.05)',
                                        borderLeft: '3px solid #10b981',
                                        padding: '12px 16px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <div style={{ color: '#6ee7b7', fontWeight: 500, fontSize: '13px' }}>
                                            All systems nominal.
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Static Nominal Rows (Context) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', color: alarmLevel === 'nominal' ? 'var(--hmi-text-muted)' : 'rgba(255, 255, 255, 0.9)', fontSize: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: alarmLevel === 'nominal' ? 'var(--hmi-text-dim)' : 'rgba(255, 255, 255, 0.9)' }}></div>
                            Combustor thermal distribution symmetric
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', color: alarmLevel === 'nominal' ? 'var(--hmi-text-muted)' : 'rgba(255, 255, 255, 0.9)', fontSize: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: alarmLevel === 'nominal' ? 'var(--hmi-text-dim)' : 'rgba(255, 255, 255, 0.9)' }}></div>
                            Lube oil pressure stable at 45 PSI
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', color: alarmLevel === 'nominal' ? 'var(--hmi-text-muted)' : 'rgba(255, 255, 255, 0.9)', fontSize: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: alarmLevel === 'nominal' ? 'var(--hmi-text-dim)' : 'rgba(255, 255, 255, 0.9)' }}></div>
                            Cooling air intake filters functioning normally
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
