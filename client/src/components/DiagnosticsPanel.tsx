import type { TelemetryPayload, PdMState, ConnectionStatus } from '../types/telemetry';

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
        const isVibCritical = pdmState.estimatedRUL < 30;
        const isVibWarning = pdmState.estimatedRUL < 60;

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
            <div className="hmi-panel-header" style={{ borderBottomColor: alarmLevel !== 'nominal' ? `${statusColor}40` : 'var(--hmi-border)' }}>
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
                                        background: '#2a0a0a',
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
                                            <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '13px' }}>
                                                THERMAL RUNAWAY: Sustained high combustor temp
                                            </div>
                                            <div style={{ color: '#fca5a5', opacity: 0.8, fontSize: '12px', marginTop: '2px' }}>
                                                Temp: {pdmState.smoothedTemperature.toFixed(1)}°C. Recommend immediate shutdown.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {pdmState.estimatedRUL < 60 && (
                                    <div style={{
                                        background: '#2a0a0a',
                                        borderLeft: `3px solid ${pdmState.estimatedRUL < 30 ? 'var(--hmi-alarm-critical)' : 'var(--hmi-alarm-warning)'}`,
                                        padding: '12px 16px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px'
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={pdmState.estimatedRUL < 30 ? 'var(--hmi-alarm-critical)' : 'var(--hmi-alarm-warning)'} strokeWidth="2" style={{ marginTop: '2px' }} className="fault-pulse">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <div>
                                            <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '13px' }}>
                                                BEARING FAULT: Degradation slope steepening
                                            </div>
                                            <div style={{ color: '#fca5a5', opacity: 0.8, fontSize: '12px', marginTop: '2px' }}>
                                                RUL &lt; 60s. Recommend step-down protocol immediately.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {pdmState.temperatureStatus === 'nominal' && pdmState.estimatedRUL >= 60 && (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', color: 'var(--hmi-text-muted)', fontSize: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--hmi-text-dim)' }}></div>
                            Combustor thermal distribution symmetric
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', color: 'var(--hmi-text-muted)', fontSize: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--hmi-text-dim)' }}></div>
                            Lube oil pressure stable at 45 PSI
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', color: 'var(--hmi-text-muted)', fontSize: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--hmi-text-dim)' }}></div>
                            Cooling air intake filters functioning normally
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
