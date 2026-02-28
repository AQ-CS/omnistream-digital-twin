import React, { forwardRef, useImperativeHandle, useRef } from 'react';

export interface LiveReadoutHandle {
    updateValue: (val: number | string) => void;
}

interface LiveReadoutProps {
    label: string;
    unit: string;
    fractionDigits?: number;
    accentColor?: string;
    icon?: 'rpm' | 'vibration' | 'temperature';
}

const icons: Record<string, React.ReactElement> = {
    rpm: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
        </svg>
    ),
    vibration: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h2l3-7 4 14 4-14 3 7h4" />
        </svg>
    ),
    temperature: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0Z" />
        </svg>
    ),
};

export const LiveReadout = forwardRef<LiveReadoutHandle, LiveReadoutProps>(
    ({ label, unit, fractionDigits = 2, accentColor = '#38bdf8', icon = 'rpm' }, ref) => {
        const valueRef = useRef<HTMLSpanElement>(null);

        useImperativeHandle(ref, () => ({
            updateValue: (val: number | string) => {
                if (valueRef.current) {
                    valueRef.current.innerText = typeof val === 'number'
                        ? val.toFixed(fractionDigits)
                        : val;
                }
            },
        }));

        return (
            <div
                className="readout-card"
                style={{ '--accent-color': accentColor } as React.CSSProperties}
            >
                <div className="readout-icon">
                    {icons[icon]}
                </div>
                <div className="readout-info">
                    <div className="readout-label">{label}</div>
                    <div className="readout-value-row">
                        <span ref={valueRef} className="readout-value tabular-data">
                            ---
                        </span>
                        <span className="readout-unit">{unit}</span>
                    </div>
                </div>
            </div>
        );
    }
);

LiveReadout.displayName = 'LiveReadout';
