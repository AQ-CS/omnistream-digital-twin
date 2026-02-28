import { useEffect, useRef, useState } from 'react';
import type { AlignedData } from 'uplot';
import { LiveReadout, type LiveReadoutHandle } from './components/LiveReadout';
import { TelemetryChart, type TelemetryChartHandle, type ChartConfig } from './components/TelemetryChart';
import { DigitalTwinSchematic, type DigitalTwinSchematicHandle, type TwinNodeState } from './components/DigitalTwinSchematic';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { FleetOverview } from './components/FleetOverview';
import { TelemetryHistorian } from './utils/Historian';
import type { TelemetryPayload, FleetPdMState } from './types/telemetry';
import type { PdMWorkerOutput } from './workers/pdm.worker';
import PdMWorker from './workers/pdm.worker?worker';

// ─── Chart Configs ──────────────────────────────────────────
const RPM_CONFIG: ChartConfig = {
  label: 'RPM', stroke: '#38bdf8', yMin: 3450, yMax: 3850, warningLimit: 3700, criticalLimit: 3800,
};

const VIB_CONFIG: ChartConfig = {
  label: 'Vibration', stroke: '#94a3b8', secondaryStroke: '#f59e0b', yMin: -5, yMax: 16, warningLimit: 7.0, criticalLimit: 12.0,
};

const TEMP_CONFIG: ChartConfig = {
  label: 'Temp °C', stroke: '#818cf8', yMin: 870, yMax: 970, warningLimit: 940, criticalLimit: 955,
};

const TURBINES = ['T-01', 'T-02', 'T-03'];

function App() {
  // ─── Turbine Selection State ────────────────────────────────
  const [selectedTurbine, setSelectedTurbine] = useState<string>('OVERVIEW');
  const selectedTurbineRef = useRef(selectedTurbine);
  useEffect(() => {
    selectedTurbineRef.current = selectedTurbine;
  }, [selectedTurbine]);

  // ─── React Hook State for UI Rendering ─────────────────────
  // For the Sidebar dots, we need React state since we want the dots to re-render. 
  // We throttle this to prevent 50Hz React crashes (we only need the visual alarm states).
  const [fleetState, setFleetState] = useState<FleetPdMState>({});
  const [fleetTelemetry, setFleetTelemetry] = useState<TelemetryPayload[]>([]);

  // For Diagnostics Panel payload render
  const [currentPayload, setCurrentPayload] = useState<TelemetryPayload | undefined>();

  // ─── Imperative Refs (Isolating 50Hz Data from React) ──────
  const rpmChartRef = useRef<TelemetryChartHandle>(null);
  const vibChartRef = useRef<TelemetryChartHandle>(null);
  const tempChartRef = useRef<TelemetryChartHandle>(null);
  const schematicRef = useRef<DigitalTwinSchematicHandle>(null);
  const rpmRef = useRef<LiveReadoutHandle>(null);
  const vibRef = useRef<LiveReadoutHandle>(null);
  const tempRef = useRef<LiveReadoutHandle>(null);
  const rulTextRef = useRef<HTMLSpanElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const warningTitleRef = useRef<HTMLDivElement>(null);
  const warningDescRef = useRef<HTMLDivElement>(null);
  const warningMetricLabelRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // ─── Data Buffers ───────────────────────────────────────────
  const rpmBuffer = useRef<number[][]>([[], []]);
  const vibBuffer = useRef<number[][]>([[], [], []]);
  const tempBuffer = useRef<number[][]>([[], []]);

  // ─── Historian ──────────────────────────────────────────────
  const historianRef = useRef<TelemetryHistorian>(new TelemetryHistorian());

  // ─── Handle Selection Change ─────────────────────────────────
  // When the user swaps left-nav turbines, fetch recent history to prepopulate charts
  useEffect(() => {
    if (selectedTurbine === 'OVERVIEW') return;

    const history = historianRef.current.getRecent(selectedTurbine, 500);

    rpmBuffer.current = [history.map(p => p.t / 1000), history.map(p => p.r)];

    const rawVib = history.map(p => p.v);
    const peakVib = rawVib.map((_, idx, arr) => {
      const start = Math.max(0, idx - 49);
      const window = arr.slice(start, idx + 1);
      return Math.max(...window.map(Math.abs));
    });
    vibBuffer.current = [history.map(p => p.t / 1000), rawVib, peakVib];

    tempBuffer.current = [history.map(p => p.t / 1000), history.map(p => p.c)];

    rpmChartRef.current?.updateData(rpmBuffer.current as AlignedData);
    vibChartRef.current?.updateData(vibBuffer.current as AlignedData);
    tempChartRef.current?.updateData(tempBuffer.current as AlignedData);

    // Reset warnings / UI states by pulling current state
    const currentPdM = fleetState[selectedTurbine];

    console.log(`[UI] Switched to ${selectedTurbine}. fleetState value:`, currentPdM);

    if (currentPdM && selectedTurbine !== 'OVERVIEW') {
      const { estimatedRUL, temperatureStatus, smoothedTemperature } = currentPdM;
      let ns: TwinNodeState = 'nominal';

      const isThermalCritical = temperatureStatus === 'critical';
      const isThermalWarning = temperatureStatus === 'warning';
      const isVibCritical = estimatedRUL <= 0 || estimatedRUL < 30;
      const isVibWarning = estimatedRUL < 60;

      if (isThermalCritical || estimatedRUL <= 0) ns = 'failure';
      else if (isVibCritical) ns = 'critical';
      else if (isThermalWarning || isVibWarning) ns = 'warning';

      console.log(`[UI] Setting initial schematic state to: ${ns} (RUL: ${estimatedRUL.toFixed(1)}, Temp Status: ${temperatureStatus})`);
      schematicRef.current?.updateBearingState(ns);

      if (ns !== 'nominal') {
        if (warningRef.current) warningRef.current.style.display = 'flex';

        // Determine whether to show Thermal or Bearing fault message
        if (isThermalCritical || isThermalWarning) {
          if (warningTitleRef.current) warningTitleRef.current.innerText = `Agentic Warning: Thermal Runaway Detected on ${selectedTurbine}`;
          if (warningDescRef.current) warningDescRef.current.innerText = `Combustor temperature exceeding maximum safe limits.`;
          if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `TEMP °C`;
          if (rulTextRef.current) rulTextRef.current.innerText = smoothedTemperature ? smoothedTemperature.toFixed(1) : '---';
        } else {
          if (warningTitleRef.current) warningTitleRef.current.innerText = `Agentic Warning: Bearing Degradation Detected on ${selectedTurbine}`;
          if (warningDescRef.current) warningDescRef.current.innerText = `Vibration trend projects imminent threshold breach.`;
          if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `EST. RUL`;
          if (estimatedRUL <= 0) {
            if (rulTextRef.current) rulTextRef.current.innerText = 'CRITICAL';
          } else {
            if (rulTextRef.current) rulTextRef.current.innerText = `${estimatedRUL.toFixed(1)}s`;
          }
        }
      } else if (warningRef.current) {
        console.log(`[UI] Hiding warning banner (Systems Nominal)`);
        warningRef.current.style.display = 'none';
      }
    } else if (warningRef.current) {
      console.log(`[UI] Overview mode or undefined fleetState. Hiding warning banner.`);
      warningRef.current.style.display = 'none';
      schematicRef.current?.updateBearingState('nominal');
    }

    const last = history.length > 0 ? history[history.length - 1] : { r: 3600, v: 1.5, c: 900 };
    schematicRef.current?.updateTempValue(last.c);
    schematicRef.current?.updateVibValue(last.v);
    schematicRef.current?.updateRpmValue(last.r);
  }, [selectedTurbine]);


  // ─── Web Worker Setup ────────────────────────────────────────
  useEffect(() => {
    const worker = new PdMWorker();
    workerRef.current = worker;

    // Throttle React state updates to ~2Hz so we don't block the main thread UI
    let lastRenderTime = 0;

    worker.onmessage = (e: MessageEvent<PdMWorkerOutput>) => {
      const { states } = e.data;

      const now = Date.now();
      if (now - lastRenderTime > 500) {
        setFleetState(states);

        // Also check if the currently selected turbine's state cleared and update the banner
        const activeTurbine = selectedTurbineRef.current;
        if (activeTurbine !== 'OVERVIEW') {
          const activeState = states[activeTurbine];
          if (activeState) {
            const { estimatedRUL, temperatureStatus, smoothedTemperature } = activeState;

            // Schematic bearing state
            let ns: TwinNodeState = 'nominal';

            const isThermalCritical = temperatureStatus === 'critical';
            const isThermalWarning = temperatureStatus === 'warning';
            const isVibCritical = estimatedRUL <= 0 || estimatedRUL < 30;
            const isVibWarning = estimatedRUL < 60;

            if (isThermalCritical || estimatedRUL <= 0) ns = 'failure';
            else if (isVibCritical) ns = 'critical';
            else if (isThermalWarning || isVibWarning) ns = 'warning';

            schematicRef.current?.updateBearingState(ns);

            // Warning banner overlay
            if (ns !== 'nominal') {
              if (warningRef.current) warningRef.current.style.display = 'flex';

              if (isThermalCritical || isThermalWarning) {
                if (warningTitleRef.current) warningTitleRef.current.innerText = `Agentic Warning: Thermal Runaway Detected on ${activeTurbine}`;
                if (warningDescRef.current) warningDescRef.current.innerText = `Combustor temperature exceeding maximum safe limits.`;
                if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `TEMP °C`;
                if (rulTextRef.current) rulTextRef.current.innerText = smoothedTemperature ? smoothedTemperature.toFixed(1) : '---';
              } else {
                if (warningTitleRef.current) warningTitleRef.current.innerText = `Agentic Warning: Bearing Degradation Detected on ${activeTurbine}`;
                if (warningDescRef.current) warningDescRef.current.innerText = `Vibration trend projects imminent threshold breach.`;
                if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `EST. RUL`;
                if (estimatedRUL <= 0) {
                  if (rulTextRef.current) rulTextRef.current.innerText = 'CRITICAL';
                } else {
                  if (rulTextRef.current) rulTextRef.current.innerText = `${estimatedRUL.toFixed(1)}s`;
                }
              }
            } else if (warningRef.current) {
              warningRef.current.style.display = 'none';
            }
          }
        }

        lastRenderTime = now;
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []); // Run ONCE on mount. Do not rebind worker on turbine change, otherwise it wipes the fleet PdM state.

  // ─── WebSocket Engine ────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current = ws;

    ws.onopen = () => console.log('[HMI] Connected @ 50Hz (Multiplexed Fleet)');

    let lastPayloadRender = 0;

    ws.onmessage = (event: MessageEvent) => {
      try {
        // Now expecting an array of [{id, t, r, v, c}]
        const payloadArray: TelemetryPayload[] = JSON.parse(event.data as string);

        // 1) Push everything to Worker and Historian
        const workerUpdates = [];
        for (const p of payloadArray) {
          historianRef.current.add(p);
          workerUpdates.push({ id: p.id, timestamp: p.t / 1000, vibration: p.v, temperature: p.c });
        }
        workerRef.current?.postMessage({ updates: workerUpdates });

        // 2) Filter the array to ONLY apply imperative DOM updates for the selected turbine
        const activeTurbine = selectedTurbineRef.current;
        if (activeTurbine !== 'OVERVIEW') {
          const activePayload = payloadArray.find(p => p.id === activeTurbine);

          if (activePayload) {
            const ts = activePayload.t / 1000;

            // Throttle React state for the Diagnostics Panel
            const now = Date.now();
            if (now - lastPayloadRender > 500) {
              setCurrentPayload(activePayload);
              setFleetTelemetry(payloadArray);
              lastPayloadRender = now;
            }

            // Push to chart buffers
            rpmBuffer.current[0].push(ts); rpmBuffer.current[1].push(activePayload.r);
            vibBuffer.current[0].push(ts); vibBuffer.current[1].push(activePayload.v);

            const rawArr = vibBuffer.current[1];
            const recent = rawArr.slice(-50); // 1-second window for UI smoothness
            const currentPeak = Math.max(...recent.map(Math.abs));
            // console.log(`[UI] ${activeTurbine} | Peak Vibration: ${currentPeak.toFixed(2)} mm/s`);
            vibBuffer.current[2].push(currentPeak);

            tempBuffer.current[0].push(ts); tempBuffer.current[1].push(activePayload.c);

            // Scrolling 10s Window
            for (const buf of [rpmBuffer, vibBuffer, tempBuffer]) {
              if (buf.current[0].length > 500) {
                buf.current[0].shift();
                buf.current[1].shift();
                if (buf.current.length > 2) buf.current[2].shift();
              }
            }

            // Direct DOM manipulation
            rpmRef.current?.updateValue(activePayload.r);
            vibRef.current?.updateValue(currentPeak);
            tempRef.current?.updateValue(activePayload.c);

            rpmChartRef.current?.updateData(rpmBuffer.current as AlignedData);
            vibChartRef.current?.updateData(vibBuffer.current as AlignedData);
            tempChartRef.current?.updateData(tempBuffer.current as AlignedData);

            schematicRef.current?.updateRpmValue(activePayload.r);
            schematicRef.current?.updateVibValue(currentPeak);
            schematicRef.current?.updateTempValue(activePayload.c);
          }
        } else {
          // If we are in Overview mode, we must still throttle and publish root react state
          const now = Date.now();
          if (now - lastPayloadRender > 500) {
            setFleetTelemetry(payloadArray);
            lastPayloadRender = now;
          }
        }

      } catch (err) {
        console.error('[HMI] Parse error', err);
      }
    };

    ws.onclose = () => console.log('[HMI] Disconnected');
    return () => { ws.close(); wsRef.current = null; };
  }, []); // Connect ONCE. Avoid WS reconnects on tab swapping!


  // ─── Actions ─────────────────────────────────────────────────
  const send = (type: string): void => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type }));
    }
  };

  const exportIncident = (): void => {
    historianRef.current.exportCSV(selectedTurbine);
  };

  // ─── Sidebar Render Helpers ───────────────────────────────────
  const renderStatusIcon = (rul: number, tempStatus?: string) => {
    const isCritical = rul < 30 || tempStatus === 'critical';
    const isWarning = rul < 60 || tempStatus === 'warning';

    // X for Critical
    if (isCritical) return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--hmi-alarm-critical)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>;
    // Triangle for Warning
    if (isWarning) return <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--hmi-alarm-warning)"><path d="M12 2L22 20H2Z" /></svg>;
    // Hollow Circle for Nominal
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><circle cx="12" cy="12" r="10" /></svg>;
  };


  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="app-layout">

      {/* ─── LEFT SIDEBAR ────────────────────────────── */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">OmniStream</h1>
          <p className="sidebar-subtitle">Fleet Monitor</p>
        </div>
        <div className="sidebar-nav">
          <div
            className={`sidebar-item ${selectedTurbine === 'OVERVIEW' ? 'active' : ''}`}
            onClick={() => setSelectedTurbine('OVERVIEW')}
            style={{ marginBottom: '8px', borderBottom: '1px solid var(--hmi-border)', paddingBottom: '16px', borderRadius: 0 }}
          >
            <span className="sidebar-item-label" style={{ color: 'var(--hmi-accent)' }}>FLEET OVERVIEW</span>
            {Object.values(fleetState).some(p => p.estimatedRUL < 60 || p.temperatureStatus !== 'nominal') && (
              renderStatusIcon(
                Math.min(...Object.values(fleetState).map(p => p.estimatedRUL)),
                Object.values(fleetState).some(p => p.temperatureStatus === 'critical') ? 'critical' : Object.values(fleetState).some(p => p.temperatureStatus === 'warning') ? 'warning' : 'nominal'
              )
            )}
          </div>
          {TURBINES.map(id => (
            <div
              key={id}
              className={`sidebar-item ${selectedTurbine === id ? 'active' : ''}`}
              onClick={() => setSelectedTurbine(id)}
            >
              <span className="sidebar-item-label">{id}</span>
              {renderStatusIcon(fleetState[id] ? fleetState[id].estimatedRUL : Infinity, fleetState[id]?.temperatureStatus)}
            </div>
          ))}
        </div>
      </nav>

      {/* ─── MAIN CONTENT ────────────────────────────── */}
      <main className="main-content">
        <div className="main-scroll">

          {/* Header */}
          <header className="hmi-header">
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--hmi-text-primary)', letterSpacing: '-0.02em' }}>
                {selectedTurbine === 'OVERVIEW' ? 'Level 1 Overview' : `Turbine ${selectedTurbine}`}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--hmi-text-muted)' }}>
                {selectedTurbine === 'OVERVIEW' ? 'Global Fleet Status View' : 'Selected Asset Telemetry View'} · ISA-101 HMI
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button className="hmi-btn" onClick={() => send('INJECT_FAULT')}>Bearing Fault</button>
              <button className="hmi-btn" onClick={() => send('THERMAL_RUNAWAY')}>Thermal Runaway</button>
              <button className="hmi-btn" onClick={() => send('CLEAR_FAULT')}>Clear All</button>
              {selectedTurbine !== 'OVERVIEW' && (
                <>
                  <div style={{ width: '1px', height: '24px', background: 'var(--hmi-border)' }}></div>
                  <button className="hmi-btn" onClick={exportIncident}>Export Incident Report</button>
                </>
              )}
              <div style={{ width: '1px', height: '24px', background: 'var(--hmi-border)' }}></div>
              <div className="live-indicator">
                <div className="live-dot"></div>
                <span className="live-text">50Hz Live</span>
              </div>
            </div>
          </header>

          {selectedTurbine === 'OVERVIEW' && (
            <FleetOverview fleetState={fleetState} fleetTelemetry={fleetTelemetry} onDrillDown={setSelectedTurbine} />
          )}

          {selectedTurbine !== 'OVERVIEW' && (
            <>
              {/* Warning Banner Overlay */}
              <div ref={warningRef} className="warning-banner" style={{ display: 'none' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="fault-pulse" style={{ flexShrink: 0 }}>
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div ref={warningTitleRef} style={{ fontSize: '14px', fontWeight: 700, color: '#fca5a5' }}>Agentic Warning: Bearing Degradation Detected on {selectedTurbine}</div>
                  <div ref={warningDescRef} style={{ fontSize: '12px', color: '#fca5a580', marginTop: '2px' }}>Vibration trend projects imminent threshold breach</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div ref={warningMetricLabelRef} style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f8717180' }}>Est. RUL</div>
                  <span ref={rulTextRef} className="tabular-data" style={{ fontSize: '28px', fontWeight: 800, color: '#fca5a5' }}>--</span>
                </div>
              </div>

              {/* Top Readouts */}
              <div className="readouts-grid">
                <LiveReadout ref={rpmRef} label="Rotor Speed" unit="RPM" fractionDigits={0} icon="rpm" accentColor="#38bdf8" />
                <LiveReadout ref={vibRef} label="Vibration" unit="mm/s" fractionDigits={2} icon="vibration" accentColor="#94a3b8" />
                <LiveReadout ref={tempRef} label="Combustor Temp" unit="°C" fractionDigits={1} icon="temperature" accentColor="#818cf8" />
              </div>

              {/* Dashboard Split Views */}
              <div className="dashboard-grid">

                {/* Left Column: Schematic & Diagnostics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ height: '350px' }}>
                    <DigitalTwinSchematic ref={schematicRef} />
                  </div>
                  <DiagnosticsPanel
                    turbineId={selectedTurbine}
                    payload={currentPayload}
                    pdmState={fleetState[selectedTurbine]}
                  />
                </div>

                {/* Right Column: Stacked Charts */}
                <div className="charts-stack">
                  <TelemetryChart ref={rpmChartRef} title="Rotor Speed" config={RPM_CONFIG} width={500} height={150} />
                  <TelemetryChart ref={vibChartRef} title="Bearing Vibration" config={VIB_CONFIG} width={500} height={150} />
                  <TelemetryChart ref={tempChartRef} title="Combustor Temp" config={TEMP_CONFIG} width={500} height={150} />
                </div>

              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
