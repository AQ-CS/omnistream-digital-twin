import type { TelemetryPayload, FleetPdMState } from '../types/telemetry';

interface FleetOverviewProps {
    fleetState: FleetPdMState;
    fleetTelemetry: TelemetryPayload[];
    onDrillDown: (id: string) => void;
}

export function FleetOverview({ fleetState, fleetTelemetry, onDrillDown }: FleetOverviewProps) {
    const turbines = ['T-01', 'T-02', 'T-03'];

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ borderBottom: '2px solid var(--hmi-border)', paddingBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--hmi-text-primary)', letterSpacing: '-0.02em' }}>
                    Fleet Overview
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--hmi-text-muted)' }}>
                    Level 1 Situation Awareness Pipeline · ISA-101 HMI
                </p>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '24px'
            }}>
                {turbines.map(id => {
                    const pdm = fleetState[id];
                    const tele = fleetTelemetry.find(t => t.id === id);

                    // State Calculation
                    let statusColor = 'var(--hmi-text-dim)';
                    let bgWarning = false;

                    let isThermalWarning = false;
                    let isThermalCritical = false;

                    if (pdm) {
                        isThermalWarning = pdm.temperatureStatus === 'warning';
                        isThermalCritical = pdm.temperatureStatus === 'critical';

                        // Worst-Case Severity Check
                        if (pdm.estimatedRUL < 30 || isThermalCritical) {
                            statusColor = 'var(--hmi-alarm-critical)';
                            bgWarning = true;
                        } else if (pdm.estimatedRUL < 60 || isThermalWarning) {
                            statusColor = 'var(--hmi-alarm-warning)';
                            bgWarning = true;
                        } else {
                            statusColor = '#10b981';
                        }
                    }

                    const renderStatusIcon = (rul: number, tempStatus: string | undefined) => {
                        const isCritical = rul < 30 || tempStatus === 'critical';
                        const isWarning = rul < 60 || tempStatus === 'warning';

                        if (isCritical) return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--hmi-alarm-critical)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>;
                        if (isWarning) return <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--hmi-alarm-warning)"><path d="M12 2L22 20H2Z" /></svg>;
                        if (rul === Infinity && !pdm) return null;
                        return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><circle cx="12" cy="12" r="10" /></svg>;
                    };

                    return (
                        <div
                            key={id}
                            onClick={() => onDrillDown(id)}
                            className="hmi-panel"
                            style={{
                                cursor: 'pointer',
                                border: bgWarning ? `1px solid ${statusColor}80` : '1px solid var(--hmi-border)',
                                boxSizing: 'border-box',
                                transition: 'all 0.2s',
                                backgroundColor: bgWarning ? `${statusColor}10` : 'var(--hmi-bg-card)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = bgWarning ? statusColor : 'var(--hmi-text-dim)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = bgWarning ? `${statusColor}80` : 'var(--hmi-border)';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            <div className="hmi-panel-header" style={{ borderBottomColor: bgWarning ? `${statusColor}40` : 'var(--hmi-border)' }}>
                                <span className="hmi-panel-title" style={{ fontSize: '14px', color: 'var(--hmi-text-primary)' }}>{id}</span>
                                <div style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: `1px solid ${statusColor}40`,
                                    backgroundColor: `${statusColor}15`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {renderStatusIcon(pdm ? pdm.estimatedRUL : Infinity, pdm?.temperatureStatus)}
                                </div>
                            </div>

                            <div className="hmi-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--hmi-text-muted)', fontWeight: 600 }}>Rotor Speed</span>
                                    <div className="tabular-data">
                                        <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--hmi-text-primary)' }}>
                                            {tele ? tele.r.toFixed(0) : '---'}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--hmi-text-dim)', marginLeft: '4px' }}>RPM</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--hmi-text-muted)', fontWeight: 600 }}>Combustor</span>
                                    <div className="tabular-data">
                                        <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--hmi-text-primary)' }}>
                                            {tele ? tele.c.toFixed(1) : '---'}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--hmi-text-dim)', marginLeft: '4px' }}>°C</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--hmi-text-muted)', fontWeight: 600 }}>Vibration (Peak)</span>
                                    <div className="tabular-data">
                                        <span style={{ fontSize: '20px', fontWeight: 700, color: bgWarning ? statusColor : 'var(--hmi-text-primary)' }}>
                                            {pdm ? pdm.smoothedVibration.toFixed(2) : '---'}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--hmi-text-dim)', marginLeft: '4px' }}>mm/s</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                padding: '12px 16px',
                                borderTop: bgWarning ? `1px solid ${statusColor}40` : '1px solid var(--hmi-border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--hmi-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    {isThermalCritical || isThermalWarning ? 'THERMAL STATUS' : 'ESTIMATED RUL'}
                                </span>
                                <span className="tabular-data" style={{
                                    fontSize: '16px',
                                    fontWeight: bgWarning ? 800 : 600,
                                    color: bgWarning ? statusColor : 'var(--hmi-text-primary)'
                                }}>
                                    {isThermalCritical || isThermalWarning ?
                                        `${pdm?.smoothedTemperature.toFixed(1)} °C` :
                                        (pdm && pdm.estimatedRUL < Infinity ? `${pdm.estimatedRUL.toFixed(1)}s` : 'Inf')
                                    }
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
