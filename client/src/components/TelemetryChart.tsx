import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import uPlot, { type AlignedData } from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartConfig {
    label: string;
    stroke: string;
    yMin?: number;
    yMax?: number;
    warningLimit?: number;
    criticalLimit?: number;
}

export interface TelemetryChartHandle {
    updateData: (data: AlignedData) => void;
}

interface TelemetryChartProps {
    title: string;
    config: ChartConfig;
    width?: number;
    height?: number;
}

export const TelemetryChart = forwardRef<TelemetryChartHandle, TelemetryChartProps>(
    ({ title, config, width = 540, height = 160 }, ref) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const plotRef = useRef<uPlot | null>(null);

        useImperativeHandle(ref, () => ({
            updateData: (data: AlignedData) => {
                if (plotRef.current) {
                    plotRef.current.setData(data);
                }
            },
        }));

        useEffect(() => {
            if (!containerRef.current) return;

            // Build limit-line drawing hook
            const drawLimitLines: uPlot.Hook = (u: uPlot) => {
                const ctx = u.ctx;
                const yAxis = u.axes[1];
                const left = u.bbox.left;
                const w = u.bbox.width;

                // Helper: convert Y value to canvas pixel
                const valToPos = (val: number): number | null => {
                    const scale = u.scales[yAxis.scale ?? 'y'];
                    if (!scale || scale.min == null || scale.max == null) return null;
                    if (val < scale.min || val > scale.max) return null;
                    return u.valToPos(val, yAxis.scale ?? 'y', true);
                };

                ctx.save();

                // Warning limit — yellow dashed
                if (config.warningLimit !== undefined) {
                    const yPx = valToPos(config.warningLimit);
                    if (yPx !== null) {
                        ctx.strokeStyle = '#f59e0b';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        ctx.moveTo(left, yPx);
                        ctx.lineTo(left + w, yPx);
                        ctx.stroke();
                    }
                }

                // Critical limit — red solid
                if (config.criticalLimit !== undefined) {
                    const yPx = valToPos(config.criticalLimit);
                    if (yPx !== null) {
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.moveTo(left, yPx);
                        ctx.lineTo(left + w, yPx);
                        ctx.stroke();
                    }
                }

                ctx.restore();
            };

            const opts: uPlot.Options = {
                width: width,
                height: height,
                cursor: { show: false },
                legend: { show: false },
                padding: [8, 8, 0, 0],
                hooks: {
                    drawAxes: [drawLimitLines],
                },
                axes: [
                    {
                        stroke: '#475569',
                        grid: { stroke: '#1e293b', width: 1 },
                        ticks: { stroke: '#334155', width: 1, size: 4 },
                        font: '10px "JetBrains Mono", monospace',
                        gap: 4,
                    },
                    {
                        stroke: '#475569',
                        grid: { stroke: '#1e293b', width: 1 },
                        ticks: { stroke: '#334155', width: 1, size: 4 },
                        font: '10px "JetBrains Mono", monospace',
                        gap: 4,
                        size: 50,
                        ...(config.yMin !== undefined && { min: config.yMin }),
                        ...(config.yMax !== undefined && { max: config.yMax }),
                    },
                ],
                series: [
                    {},
                    {
                        label: config.label,
                        stroke: config.stroke,
                        width: 1.5,
                        fill: config.stroke + '10',
                    },
                ],
            };

            const plot = new uPlot(opts, [[], []], containerRef.current);
            plotRef.current = plot;

            return () => {
                plot.destroy();
                plotRef.current = null;
            };
        }, [title, config, width, height]);

        return (
            <div className="chart-panel">
                <div className="chart-panel-header">
                    <div className="chart-dot" style={{ background: config.stroke }}></div>
                    <span className="chart-label">{title}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {config.warningLimit !== undefined && (
                            <span style={{ fontSize: '9px', fontWeight: 600, color: '#f59e0b', letterSpacing: '0.05em' }}>
                                ⚠ {config.warningLimit}
                            </span>
                        )}
                        {config.criticalLimit !== undefined && (
                            <span style={{ fontSize: '9px', fontWeight: 600, color: '#ef4444', letterSpacing: '0.05em' }}>
                                ✕ {config.criticalLimit}
                            </span>
                        )}
                    </div>
                </div>
                <div className="chart-body">
                    <div ref={containerRef} />
                </div>
            </div>
        );
    }
);

TelemetryChart.displayName = 'TelemetryChart';
