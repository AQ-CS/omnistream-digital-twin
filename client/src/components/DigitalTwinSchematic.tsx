import React, { useImperativeHandle, forwardRef, useState } from 'react';
import { TEMP_LIMITS } from '../config/thresholds';

export interface DigitalTwinSchematicHandle {
    updateBearingState: (state: string) => void;
    updateTempValue: (temp: number) => void;
    updateVibValue: (vib: number) => void;
    updateRpmValue: (rpm: number) => void;
}

export const DigitalTwinSchematic = forwardRef<DigitalTwinSchematicHandle>((_, ref) => {
    const [bearingStatus, setBearingStatus] = useState('nominal');
    const [temp, setTemp] = useState(596);
    const [rpm, setRpm] = useState(6600);

    useImperativeHandle(ref, () => ({
        updateBearingState: (state) => setBearingStatus(state),
        updateTempValue: (val) => setTemp(val),
        updateVibValue: () => { },
        updateRpmValue: (val) => setRpm(val)
    }));

    const getThermalColor = () => {
        if (temp >= TEMP_LIMITS.critical) return '#ef4444';
        if (temp >= TEMP_LIMITS.warning) return '#f59e0b';
        return '#475569';
    };

    const getThermalStroke = () => {
        if (temp >= TEMP_LIMITS.critical) return '#fca5a5';
        if (temp >= TEMP_LIMITS.warning) return '#fcd34d';
        return '#94a3b8';
    };

    const getBearingColor = () => {
        if (bearingStatus === 'failure' || bearingStatus === 'critical') return '#ef4444';
        if (bearingStatus === 'warning') return '#f59e0b';
        return '#475569';
    };

    const getThermalDarkCap = () => {
        if (temp >= TEMP_LIMITS.critical) return '#7f1d1d';
        if (temp >= TEMP_LIMITS.warning) return '#78350f';
        return '#0f172a';
    };

    const getBearingDarkCap = () => {
        if (bearingStatus === 'failure' || bearingStatus === 'critical') return '#7f1d1d';
        if (bearingStatus === 'warning') return '#78350f';
        return '#0f172a';
    };

    const shaftDuration = rpm > 0 ? `${(60 / rpm).toFixed(3)}s` : '0s';
    const genShaftDuration = rpm > 0 ? `${(60 / (rpm / 4.4)).toFixed(3)}s` : '0s';

    return (
        <div className="schematic-container" style={{ background: 'var(--hmi-bg-deep)', padding: '24px', borderRadius: '8px', border: '1px solid var(--hmi-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', maxHeight: '350px' }}>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--hmi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    SGT-800 P&ID (Volumetric Overlap)
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>DWG-NO: 800-PID-04</span>
            </div>

            <svg viewBox="0 0 1000 480" style={{ width: '100%', height: '100%', maxHeight: '350px' }}>
                <defs>
                    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse">
                        <path d="M-2,10 l12,-12 M0,0 l8,8 M6,-2 l12,12" stroke="#1e293b" strokeWidth="2" />
                    </pattern>
                </defs>

                {/* ========================================== */}
                {/* OFFSET SHAFTS & GEARBOX (Lowest Z)         */}
                {/* ========================================== */}

                <line x1="240" y1="220" x2="860" y2="220" stroke="#94a3b8" strokeWidth="6" strokeDasharray="20 10" style={{ animation: `spin-dash ${shaftDuration} linear infinite` }} />

                {/* ========================================== */}
                {/* 1. EXHAUST & BRG 2 (Right-most)            */}
                {/* ========================================== */}
                <g className="section exhaust">
                    <path d="M 860,120 A 25 100 0 0 0 860,320" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.6" />
                    <path d="M 740,120 L 860,120 A 25 100 0 0 1 860,320 L 740,320 Z" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                    <ellipse cx="740" cy="220" rx="25" ry="100" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
                    <text x="800" y="380" fill="#94a3b8" fontSize="12" fontWeight="600" textAnchor="middle">EXHAUST</text>

                    <circle cx="760" cy="220" r="16" fill="#0f172a" stroke={getBearingColor()} strokeWidth="4" className={bearingStatus !== 'nominal' ? 'fault-pulse' : ''} style={{ transition: 'stroke 0.3s ease' }} />
                    <circle cx="760" cy="220" r="6" fill={getBearingColor()} style={{ transition: 'fill 0.3s ease' }} />
                    <text x="760" y="350" fill={getBearingColor()} fontSize="12" fontWeight="bold" textAnchor="middle">BRG 2</text>
                </g>

                {/* ========================================== */}
                {/* 2. TURBINE CASING & INNER CONE             */}
                {/* ========================================== */}
                <g className="section turbine">
                    <path d="M 720,155 A 15 65 0 0 0 720,285" stroke="#0f172a" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.6" />
                    <path d="M 610,175 L 720,155 A 15 65 0 0 1 720,285 L 610,265 Z" fill={getBearingColor()} stroke="#0f172a" strokeWidth="2" style={{ transition: 'fill 0.5s ease' }} />
                    <ellipse cx="610" cy="220" rx="10" ry="45" fill={getBearingDarkCap()} stroke="#0f172a" strokeWidth="2" style={{ transition: 'fill 0.5s ease' }} />

                    <path d="M 740,130 A 25 90 0 0 0 740,310" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.6" />
                    <path d="M 610,130 L 740,130 A 25 90 0 0 1 740,310 L 610,310 Z" fill="rgba(209, 228, 255, 0.19)" stroke="#94a3b8" strokeWidth="2" />
                    <ellipse cx="610" cy="220" rx="25" ry="90" fill="rgba(15, 23, 42, 0.5)" stroke="#94a3b8" strokeWidth="2" />
                    <text x="675" y="360" fill="#94a3b8" fontSize="12" fontWeight="600" textAnchor="middle">TURBINE CASING</text>
                </g>

                {/* ========================================== */}
                {/* 3. COMBUSTOR (Widest, Overlaps Turbine!)   */}
                {/* ========================================== */}
                <g className="section combustor">
                    <path d="M 610,100 A 25 120 0 0 0 610,340" stroke={getThermalStroke()} strokeWidth="1.5" strokeDasharray="5 5" fill="none" opacity="0.6" />
                    <path d="M 510,100 L 610,100 A 25 120 0 0 1 610,340 L 510,340 Z" fill={getThermalColor()} stroke={getThermalStroke()} strokeWidth="2" style={{ transition: 'all 0.5s ease' }} />
                    <ellipse cx="510" cy="220" rx="25" ry="120" fill={getThermalDarkCap()} stroke={getThermalStroke()} strokeWidth="2" style={{ transition: 'all 0.5s ease' }} />

                    <text x="560" y="80" fill={getThermalStroke()} fontSize="12" fontWeight="bold" textAnchor="middle">COMBUSTOR</text>
                    <text x="560" y="380" fill={getThermalStroke()} fontSize="16" fontWeight="bold" textAnchor="middle">{temp.toFixed(1)} °C</text>
                </g>

                {/* ========================================== */}
                {/* 4. AXIAL COMPRESSOR (Overlaps Combustor!)  */}
                {/* ========================================== */}
                <g className="section compressor">
                    <path d="M 510,170 A 15 50 0 0 0 510,270" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.6" />
                    <path d="M 300,140 L 510,170 A 15 50 0 0 1 510,270 L 300,300 Z" fill="url(#hatch)" stroke="#64748b" strokeWidth="2" />
                    <ellipse cx="300" cy="220" rx="25" ry="80" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
                    <text x="405" y="360" fill="#94a3b8" fontSize="12" fontWeight="600" textAnchor="middle">COMPRESSOR</text>
                </g>

                {/* ========================================== */}
                {/* 5. AIR INTAKE & BRG 1                      */}
                {/* ========================================== */}
                <g className="section intake">
                    <path d="M 300,140 A 25 80 0 0 0 300,300" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.6" />
                    <path d="M 260,130 L 300,140 A 25 80 0 0 1 300,300 L 260,310 Z" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                    <ellipse cx="260" cy="220" rx="25" ry="90" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
                    <text x="280" y="100" fill="#94a3b8" fontSize="12" fontWeight="600" textAnchor="middle">INTAKE</text>

                    <circle cx="280" cy="220" r="16" fill="#0f172a" stroke={getBearingColor()} strokeWidth="4" className={bearingStatus !== 'nominal' ? 'fault-pulse' : ''} style={{ transition: 'stroke 0.3s ease' }} />
                    <circle cx="280" cy="220" r="6" fill={getBearingColor()} style={{ transition: 'fill 0.3s ease' }} />
                    <text x="280" y="350" fill={getBearingColor()} fontSize="12" fontWeight="bold" textAnchor="middle">BRG 1</text>
                </g>

                {/* ========================================== */}
                {/* 6. GEARBOX                                 */}
                {/* ========================================== */}
                <g className="section gearbox">
                    <rect x="200" y="140" width="40" height="120" rx="4" fill="#334155" stroke="#475569" strokeWidth="2" />
                    <text x="220" y="130" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">GEAR</text>
                </g>

                <line x1="160" y1="180" x2="210" y2="180" stroke="#94a3b8" strokeWidth="8" strokeDasharray="15 8" style={{ animation: `spin-dash ${genShaftDuration} linear infinite` }} />

                {/* ========================================== */}
                {/* 7. GENERATOR (Left-most, Highest Z)        */}
                {/* ========================================== */}
                <g className="section generator">
                    <path d="M 160,100 A 25 80 0 0 0 160,260" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.6" />
                    <path d="M 50,100 L 160,100 A 25 80 0 0 1 160,260 L 50,260 Z" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
                    <ellipse cx="50" cy="180" rx="25" ry="80" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                    <path d="M 70,110 L 140,110 M 70,250 L 140,250" stroke="#334155" strokeWidth="4" />
                    <text x="105" y="300" fill="#38bdf8" fontSize="14" fontWeight="600" textAnchor="middle">GENERATOR</text>
                </g>

                {/* ========================================== */}
                {/* PIPING & AUXILIARY SYSTEMS                 */}
                {/* ========================================== */}
                <g className="piping">
                    {/* Fuel Gas Piping */}
                    <path d="M 545,40 L 545,100" stroke={getThermalColor()} strokeWidth="3" fill="none" style={{ transition: 'stroke 0.5s ease' }} />
                    <polygon points="535,45 555,55 535,55 555,45" fill="#0f172a" stroke={getThermalStroke()} strokeWidth="1.5" />

                    {/* Lube Oil Piping */}
                    <path d="M 190,430 L 190,360 L 280,360 L 280,240" stroke={getBearingColor()} strokeWidth="2" fill="none" style={{ transition: 'stroke 0.3s ease' }} />
                    <path d="M 190,430 L 190,450 L 760,450 L 760,240" stroke={getBearingColor()} strokeWidth="2" fill="none" style={{ transition: 'stroke 0.3s ease' }} />

                    {/* Cooling Air Piping - Lowered to Y=65 to clear Fuel block */}
                    <path d="M 680,45 L 680,130" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 2" fill="none" />
                    <path d="M 450,150 L 450,65 L 680,65" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 2" fill="none" />
                </g>

                {/* Auxiliary System Control Blocks */}
                <g transform="translate(130, 410)">
                    <rect x="0" y="0" width="125" height="40" rx="4" fill="#0f172a" stroke={getBearingColor()} strokeWidth="1.5" style={{ transition: 'stroke 0.3s ease' }} />
                    <circle cx="16" cy="20" r="6" fill={getBearingColor()} className={bearingStatus !== 'nominal' ? 'fault-pulse' : ''} style={{ transition: 'fill 0.3s ease' }} />
                    <text x="36" y="24" fill="#94a3b8" fontSize="12" fontWeight="bold">LUBE OIL SKID</text>
                </g>

                {/* Expanded & Shifted Fuel Block */}
                <g transform="translate(460, 0)">
                    <rect x="0" y="0" width="155" height="40" rx="4" fill="#0f172a" stroke={getThermalStroke()} strokeWidth="1.5" />
                    <circle cx="16" cy="20" r="6" fill={getThermalColor()} style={{ transition: 'all 0.5s ease' }} />
                    <text x="36" y="24" fill="#94a3b8" fontSize="12" fontWeight="bold">FUEL GAS SYSTEM</text>
                </g>

                <g transform="translate(640, 0)">
                    <rect x="0" y="0" width="140" height="40" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
                    <circle cx="16" cy="20" r="6" fill="#38bdf8" />
                    <text x="36" y="24" fill="#94a3b8" fontSize="12" fontWeight="bold">COOLING BLEED</text>
                </g>

            </svg>

            <style>{`
        @keyframes spin-dash {
          to { stroke-dashoffset: -30; }
        }
        .fault-pulse {
          animation: schematic-pulse 1.5s infinite;
        }
        @keyframes schematic-pulse {
          0% { filter: drop-shadow(0 0 2px currentColor); }
          50% { filter: drop-shadow(0 0 12px currentColor); }
          100% { filter: drop-shadow(0 0 2px currentColor); }
        }
      `}</style>
        </div>
    );
});