import { useEffect, useRef } from 'react';
import type { AlignedData } from 'uplot';
import { LiveReadout, type LiveReadoutHandle } from './components/LiveReadout';
import { TelemetryChart, type TelemetryChartHandle, type ChartConfig } from './components/TelemetryChart';
import { DigitalTwinSchematic, type DigitalTwinSchematicHandle, type TwinNodeState } from './components/DigitalTwinSchematic';
import { calculateEMA, calculateLinearRegression, calculateRUL } from './utils/pdmMath';
import type { PdMState } from './types/telemetry';

// ─── Chart Configs with Threshold Limits ─────────────────────
const RPM_CONFIG: ChartConfig = {
  label: 'RPM',
  stroke: '#38bdf8',
  yMin: 3450,
  yMax: 3850,
  warningLimit: 3700,
  criticalLimit: 3800,
};

const VIB_CONFIG: ChartConfig = {
  label: 'Vibration',
  stroke: '#94a3b8',
  yMin: -5,
  yMax: 16,
  warningLimit: 7.0,
  criticalLimit: 12.0,
};

const TEMP_CONFIG: ChartConfig = {
  label: 'Temp °C',
  stroke: '#818cf8',
  yMin: 870,
  yMax: 970,
  warningLimit: 940,
  criticalLimit: 955,
};

function App() {
  // ─── Refs ──────────────────────────────────────────────────────
  const rpmChartRef = useRef<TelemetryChartHandle>(null);
  const vibChartRef = useRef<TelemetryChartHandle>(null);
  const tempChartRef = useRef<TelemetryChartHandle>(null);
  const schematicRef = useRef<DigitalTwinSchematicHandle>(null);
  const rpmRef = useRef<LiveReadoutHandle>(null);
  const vibRef = useRef<LiveReadoutHandle>(null);
  const tempRef = useRef<LiveReadoutHandle>(null);
  const rulTextRef = useRef<HTMLSpanElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ─── Data Buffers ──────────────────────────────────────────────
  const rpmBuffer = useRef<number[][]>([[], []]);
  const vibBuffer = useRef<number[][]>([[], []]);
  const tempBuffer = useRef<number[][]>([[], []]);
  const pdmBuffer = useRef<[number, number][]>([]);

  const pdmState = useRef<PdMState>({ smoothedVibration: 0, degradationSlope: 0, estimatedRUL: Infinity });
  const lastVibEMA = useRef<number | null>(null);

  // ─── WebSocket Engine ──────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current = ws;

    ws.onopen = () => console.log('[HMI] Connected @ 50Hz');

    ws.onmessage = (event: MessageEvent) => {
      try {
        const p: { t: number; r: number; v: number; c: number } = JSON.parse(event.data as string);
        const ts = p.t / 1000;

        // Push into isolated buffers
        rpmBuffer.current[0].push(ts); rpmBuffer.current[1].push(p.r);
        vibBuffer.current[0].push(ts); vibBuffer.current[1].push(p.v);
        tempBuffer.current[0].push(ts); tempBuffer.current[1].push(p.c);

        // Cap at 500 points (10s window)
        for (const buf of [rpmBuffer, vibBuffer, tempBuffer]) {
          if (buf.current[0].length > 500) {
            buf.current[0].shift();
            buf.current[1].shift();
          }
        }

        // PdM buffer (5s window = 250pts)
        pdmBuffer.current.push([ts, p.v]);
        if (pdmBuffer.current.length > 250) pdmBuffer.current.shift();

        // Imperative updates — readouts
        rpmRef.current?.updateValue(p.r);
        vibRef.current?.updateValue(p.v);
        tempRef.current?.updateValue(p.c);

        // Imperative updates — charts
        rpmChartRef.current?.updateData(rpmBuffer.current as AlignedData);
        vibChartRef.current?.updateData(vibBuffer.current as AlignedData);
        tempChartRef.current?.updateData(tempBuffer.current as AlignedData);

        // Imperative updates — schematic bullet graphs (numeric)
        schematicRef.current?.updateRpmValue(p.r);
        schematicRef.current?.updateVibValue(p.v);
        schematicRef.current?.updateTempValue(p.c);
      } catch (err) {
        console.error('[HMI] Parse error', err);
      }
    };

    ws.onclose = () => console.log('[HMI] Disconnected');
    return () => { ws.close(); wsRef.current = null; };
  }, []);

  // ─── PdM Loop (requestAnimationFrame) ──────────────────────────
  useEffect(() => {
    let raf: number;
    const tick = (): void => {
      if (pdmBuffer.current.length >= 50) {
        const latest = pdmBuffer.current[pdmBuffer.current.length - 1][1];
        const ema = calculateEMA(latest, lastVibEMA.current, 0.1);
        lastVibEMA.current = ema;
        pdmState.current.smoothedVibration = ema;

        const slope = calculateLinearRegression(pdmBuffer.current);
        pdmState.current.degradationSlope = slope;

        const rul = calculateRUL(ema, slope, 12.0);
        pdmState.current.estimatedRUL = rul;

        // Schematic state
        let ns: TwinNodeState = 'nominal';
        if (rul <= 0) {
          ns = 'failure';
        } else if (rul < 30) {
          ns = 'critical';
        } else if (rul < 60) {
          ns = 'warning';
        }
        schematicRef.current?.updateBearingState(ns);

        // Warning banner
        if (rul <= 0) {
          if (warningRef.current) warningRef.current.style.display = 'flex';
          if (rulTextRef.current) rulTextRef.current.innerText = 'CRITICAL';
        } else if (rul < 60) {
          if (warningRef.current) warningRef.current.style.display = 'flex';
          if (rulTextRef.current) rulTextRef.current.innerText = `${rul.toFixed(1)}s`;
        } else {
          if (warningRef.current) warningRef.current.style.display = 'none';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  // ─── Actions ───────────────────────────────────────────────────
  const send = (type: string): void => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type }));
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '100vh' }}>

      {/* Warning Banner */}
      <div ref={warningRef} className="warning-banner" style={{ display: 'none' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="fault-pulse" style={{ flexShrink: 0 }}>
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fca5a5' }}>Agentic Warning: Bearing Degradation Detected</div>
          <div style={{ fontSize: '12px', color: '#fca5a580', marginTop: '2px' }}>Vibration trend projects imminent threshold breach</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f8717180' }}>Est. RUL</div>
          <span ref={rulTextRef} className="tabular-data" style={{ fontSize: '28px', fontWeight: 800, color: '#fca5a5' }}>--</span>
        </div>
      </div>

      {/* Header */}
      <header className="hmi-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--hmi-text-primary)', letterSpacing: '-0.02em' }}>
            OmniStream Digital Twin
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--hmi-text-muted)' }}>
            Gas Turbine Telemetry · ISA-101 HMI · Level-1 Overview
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="hmi-btn" onClick={() => send('INJECT_FAULT')}>
            Bearing Fault
          </button>
          <button className="hmi-btn" onClick={() => send('THERMAL_RUNAWAY')}>
            Thermal Runaway
          </button>
          <button className="hmi-btn" onClick={() => send('CLEAR_FAULT')}>
            Clear All
          </button>
          <div style={{ width: '1px', height: '24px', background: 'var(--hmi-border)' }}></div>
          <div className="live-indicator">
            <div className="live-dot"></div>
            <span className="live-text">50Hz Live</span>
          </div>
        </div>
      </header>

      {/* Readouts */}
      <div className="readouts-grid">
        <LiveReadout ref={rpmRef} label="Rotor Speed" unit="RPM" fractionDigits={0} icon="rpm" accentColor="#38bdf8" />
        <LiveReadout ref={vibRef} label="Vibration" unit="mm/s" fractionDigits={2} icon="vibration" accentColor="#94a3b8" />
        <LiveReadout ref={tempRef} label="Combustor Temp" unit="°C" fractionDigits={1} icon="temperature" accentColor="#818cf8" />
      </div>

      {/* Main Grid: Schematic + Charts */}
      <div className="dashboard-grid" style={{ flex: 1 }}>
        {/* Left: Digital Twin */}
        <DigitalTwinSchematic ref={schematicRef} />

        {/* Right: Stacked Level-3 Charts */}
        <div className="charts-stack">
          <TelemetryChart ref={rpmChartRef} title="Rotor Speed" config={RPM_CONFIG} width={600} height={150} />
          <TelemetryChart ref={vibChartRef} title="Bearing Vibration" config={VIB_CONFIG} width={600} height={150} />
          <TelemetryChart ref={tempChartRef} title="Combustor Temp" config={TEMP_CONFIG} width={600} height={150} />
        </div>
      </div>
    </div>
  );
}

export default App;
