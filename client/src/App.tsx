import { useEffect, useRef, useState } from 'react';
import type { AlignedData } from 'uplot';
import { LiveReadout, type LiveReadoutHandle } from './components/LiveReadout';
import { TelemetryChart, type TelemetryChartHandle } from './components/TelemetryChart';
import { DigitalTwinSchematic, type DigitalTwinSchematicHandle } from './components/DigitalTwinSchematic';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { FleetOverview } from './components/FleetOverview';
import { TelemetryHistorian } from './utils/Historian';
import type { TelemetryPayload, FleetPdMState, ConnectionStatus, TwinNodeState } from './types/telemetry';
import { RPM_CONFIG, VIB_CONFIG, TEMP_CONFIG, VIB_LIMITS, RUL_LIMITS } from './config/thresholds';
import type { PdMWorkerOutput } from './workers/pdm.worker';
import PdMWorker from './workers/pdm.worker?worker';
import SimulationWorker from './workers/simulation.worker?worker';

const TURBINES = ['T-01', 'T-02', 'T-03'];

const CHART_INFO = {
  rpm: {
    importance: "Rotor speed is the fundamental operational baseline of the gas turbine, dictating compressor aerodynamic stability and the synchronization frequency of the coupled electrical generator (e.g., 50Hz/60Hz).",
    impact: "Mechanical binding, compressor stall, or erratic fuel valve actuation will cause high-frequency RPM jitter or uncommanded deceleration.",
    consequence: "Sustained deviation leads to grid desynchronization, resonant frequency blade shear, or an automated safety trip (turbine shutdown)."
  },
  vib: {
    importance: "Measured in velocity (mm/s) to capture fatigue-inducing energy, vibration is the primary indicator of rotor dynamic health, shaft alignment, and bearing integrity.",
    impact: "Degradation of the hydrodynamic lube oil film or microscopic physical wear in the journal bearings causes the vibration sine wave amplitude to aggressively expand.",
    consequence: "Ignored vibration trends exponentially accelerate metal fatigue, leading to catastrophic bearing seizure, shaft deflection, and destructive stator rubbing."
  },
  temp: {
    importance: "Represents the thermodynamic limit of the turbine. Temperatures must be maximized for thermal efficiency while remaining strictly beneath the melting threshold of the hot-gas-path materials.",
    impact: "Blocked cooling air intakes, fuel nozzle asymmetry, or thermal barrier coating (TBC) degradation results in localized or global thermal runaway.",
    consequence: "Sustained over-temperature conditions induce metallurgical creep, blade elongation, and eventual catastrophic melting of the turbine blades."
  }
};

function App() {
  // ─── Turbine Selection State ────────────────────────────────
  const [selectedTurbine, setSelectedTurbine] = useState<string>('OVERVIEW');
  const [overviewTarget, setOverviewTarget] = useState<string>('T-01');
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

  // ─── WebSocket Supervisor State ─────────────────────────────
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const connStatusRef = useRef<ConnectionStatus>('DISCONNECTED');
  const lastSeenRef = useRef<number>(Date.now());

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
  const warningIconRef = useRef<SVGSVGElement>(null);

  const simWorkerRef = useRef<Worker | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // ─── Data Buffers ───────────────────────────────────────────
  const rpmBuffer = useRef<number[][]>([[], []]);
  const vibBuffer = useRef<number[][]>([[], [], []]);
  const tempBuffer = useRef<number[][]>([[], []]);

  // ─── Current UI States ──────────────────────────────────────
  const currentEmaRef = useRef<Record<string, number>>({});

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
      const { estimatedRUL, temperatureStatus, smoothedTemperature, smoothedVibration } = currentPdM;

      const isThermalCritical = temperatureStatus === 'critical';
      const isThermalWarning = temperatureStatus === 'warning';
      const isVibCritical = estimatedRUL <= 0 || estimatedRUL < RUL_LIMITS.critical || smoothedVibration >= VIB_LIMITS.critical;
      const isVibWarning = estimatedRUL < RUL_LIMITS.warning || smoothedVibration >= VIB_LIMITS.warning;

      // 1. ISOLATE BEARING STATE
      let bearingState: TwinNodeState = 'nominal';
      if (estimatedRUL <= 0) bearingState = 'failure';
      else if (isVibCritical) bearingState = 'critical';
      else if (isVibWarning) bearingState = 'warning';

      console.log(`[UI] Setting initial schematic bearing state to: ${bearingState} (RUL: ${estimatedRUL.toFixed(1)})`);
      schematicRef.current?.updateBearingState(bearingState);

      // 2. ISOLATE GLOBAL STATE
      let globalState: TwinNodeState = 'nominal';
      if (isThermalCritical || estimatedRUL <= 0) globalState = 'failure';
      else if (isVibCritical) globalState = 'critical';
      else if (isThermalWarning || isVibWarning) globalState = 'warning';

      if (globalState !== 'nominal') {
        if (warningRef.current) {
          warningRef.current.style.display = 'flex';
          warningRef.current.style.background = globalState === 'warning' ? '#2d2001' : 'var(--hmi-alarm-bg)';
          warningRef.current.style.borderColor = globalState === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)';
          warningRef.current.style.borderLeftColor = globalState === 'warning' ? 'var(--hmi-alarm-warning)' : 'var(--hmi-alarm-critical)';
        }
        if (warningIconRef.current) warningIconRef.current.style.stroke = globalState === 'warning' ? 'var(--hmi-alarm-warning)' : '#ef4444';
        if (warningTitleRef.current) warningTitleRef.current.style.color = globalState === 'warning' ? '#f1f5f9' : '#fca5a5';
        if (warningDescRef.current) warningDescRef.current.style.color = globalState === 'warning' ? '#fbbf24' : 'rgba(252, 165, 165, 0.8)';
        if (warningMetricLabelRef.current) warningMetricLabelRef.current.style.color = globalState === 'warning' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(248, 113, 113, 0.8)';
        if (rulTextRef.current) rulTextRef.current.style.color = globalState === 'warning' ? 'var(--hmi-alarm-warning)' : '#fca5a5';

        if (isThermalCritical) {
          if (warningTitleRef.current) warningTitleRef.current.innerText = `CRITICAL ALARM: Thermal Runaway on ${selectedTurbine}`;
          if (warningDescRef.current) warningDescRef.current.innerText = `Combustor temperature has breached maximum safe operating limits.`;
          if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `TEMP °C`;
          if (rulTextRef.current) rulTextRef.current.innerText = smoothedTemperature ? smoothedTemperature.toFixed(1) : '---';
        } else if (isThermalWarning) {
          if (warningTitleRef.current) warningTitleRef.current.innerText = `WARNING: Thermal Instability on ${selectedTurbine}`;
          if (warningDescRef.current) warningDescRef.current.innerText = `Combustor temperature approaching critical limits.`;
          if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `TEMP °C`;
          if (rulTextRef.current) rulTextRef.current.innerText = smoothedTemperature ? smoothedTemperature.toFixed(1) : '---';
        } else if (isVibCritical) {
          if (warningTitleRef.current) warningTitleRef.current.innerText = `CRITICAL ALARM: Bearing Failure on ${selectedTurbine}`;
          if (warningDescRef.current) warningDescRef.current.innerText = `Vibration has breached safety limits. Equipment integrity compromised.`;
          if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `EST. RUL`;
          if (rulTextRef.current) rulTextRef.current.innerText = 'CRITICAL';
        } else if (isVibWarning) {
          if (warningTitleRef.current) warningTitleRef.current.innerText = `Agentic Warning: Bearing Degradation on ${selectedTurbine}`;
          if (warningDescRef.current) warningDescRef.current.innerText = `Vibration trend projects imminent threshold breach.`;
          if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `EST. RUL`;
          if (rulTextRef.current) rulTextRef.current.innerText = estimatedRUL < 999 ? `${estimatedRUL.toFixed(1)}s` : 'STABLE';
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
            const { estimatedRUL, temperatureStatus, smoothedTemperature, smoothedVibration } = activeState;
            currentEmaRef.current[activeTurbine] = smoothedVibration;

            const isThermalCritical = temperatureStatus === 'critical';
            const isThermalWarning = temperatureStatus === 'warning';
            const isVibCritical = estimatedRUL <= 0 || estimatedRUL < RUL_LIMITS.critical || smoothedVibration >= VIB_LIMITS.critical;
            const isVibWarning = estimatedRUL < RUL_LIMITS.warning || smoothedVibration >= VIB_LIMITS.warning;

            // 1. ISOLATE BEARING STATE
            let bearingState: TwinNodeState = 'nominal';
            if (estimatedRUL <= 0) bearingState = 'failure';
            else if (isVibCritical) bearingState = 'critical';
            else if (isVibWarning) bearingState = 'warning';

            schematicRef.current?.updateBearingState(bearingState);

            // 2. ISOLATE GLOBAL STATE
            let globalState: TwinNodeState = 'nominal';
            if (isThermalCritical || estimatedRUL <= 0) globalState = 'failure';
            else if (isVibCritical) globalState = 'critical';
            else if (isThermalWarning || isVibWarning) globalState = 'warning';

            // Warning banner overlay
            if (globalState !== 'nominal') {
              if (warningRef.current) {
                warningRef.current.style.display = 'flex';
                warningRef.current.style.background = globalState === 'warning' ? '#2d2001' : 'var(--hmi-alarm-bg)';
                warningRef.current.style.borderColor = globalState === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                warningRef.current.style.borderLeftColor = globalState === 'warning' ? 'var(--hmi-alarm-warning)' : 'var(--hmi-alarm-critical)';
              }
              if (warningIconRef.current) warningIconRef.current.style.stroke = globalState === 'warning' ? 'var(--hmi-alarm-warning)' : '#ef4444';
              if (warningTitleRef.current) warningTitleRef.current.style.color = globalState === 'warning' ? '#f1f5f9' : '#fca5a5';
              if (warningDescRef.current) warningDescRef.current.style.color = globalState === 'warning' ? '#fbbf24' : 'rgba(252, 165, 165, 0.8)';
              if (warningMetricLabelRef.current) warningMetricLabelRef.current.style.color = globalState === 'warning' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(248, 113, 113, 0.8)';
              if (rulTextRef.current) rulTextRef.current.style.color = globalState === 'warning' ? 'var(--hmi-alarm-warning)' : '#fca5a5';

              if (isThermalCritical) {
                if (warningTitleRef.current) warningTitleRef.current.innerText = `CRITICAL ALARM: Thermal Runaway on ${activeTurbine}`;
                if (warningDescRef.current) warningDescRef.current.innerText = `Combustor temperature has breached maximum safe operating limits.`;
                if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `TEMP °C`;
                if (rulTextRef.current) rulTextRef.current.innerText = smoothedTemperature ? smoothedTemperature.toFixed(1) : '---';
              } else if (isThermalWarning) {
                if (warningTitleRef.current) warningTitleRef.current.innerText = `WARNING: Thermal Instability on ${activeTurbine}`;
                if (warningDescRef.current) warningDescRef.current.innerText = `Combustor temperature approaching critical limits.`;
                if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `TEMP °C`;
                if (rulTextRef.current) rulTextRef.current.innerText = smoothedTemperature ? smoothedTemperature.toFixed(1) : '---';
              } else if (isVibCritical) {
                if (warningTitleRef.current) warningTitleRef.current.innerText = `CRITICAL ALARM: Bearing Failure on ${activeTurbine}`;
                if (warningDescRef.current) warningDescRef.current.innerText = `Vibration has breached safety limits. Equipment integrity compromised.`;
                if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `EST. RUL`;
                if (rulTextRef.current) rulTextRef.current.innerText = 'CRITICAL';
              } else if (isVibWarning) {
                if (warningTitleRef.current) warningTitleRef.current.innerText = `Agentic Warning: Bearing Degradation on ${activeTurbine}`;
                if (warningDescRef.current) warningDescRef.current.innerText = `Vibration trend projects imminent threshold breach.`;
                if (warningMetricLabelRef.current) warningMetricLabelRef.current.innerText = `EST. RUL`;
                if (rulTextRef.current) rulTextRef.current.innerText = estimatedRUL < 999 ? `${estimatedRUL.toFixed(1)}s` : 'STABLE';
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

  // ─── Simulation Worker Setup ──────────────────────────────────
  useEffect(() => {
    const simWorker = new SimulationWorker();
    simWorkerRef.current = simWorker;

    setConnStatus('CONNECTED');
    connStatusRef.current = 'CONNECTED';
    console.log('[HMI] Simulation Worker Connected @ 50Hz (Multiplexed Fleet)');

    let lastPayloadRender = 0;

    simWorker.onmessage = (event: MessageEvent<TelemetryPayload[]>) => {
      // Update watchdog timestamp on every message
      lastSeenRef.current = Date.now();

      // If we were STALE, we're back
      if (connStatusRef.current === 'STALE') {
        setConnStatus('CONNECTED');
        connStatusRef.current = 'CONNECTED';
      }

      try {
        const payloadArray = event.data;

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

            // Plot the worker's EMA smoothed vibration as the warning track
            // Fallback to absolute current vibration if EMA isn't populated yet
            let currentEma = currentEmaRef.current[activeTurbine];
            if (currentEma === undefined) {
              currentEma = Math.abs(activePayload.v);
            }
            vibBuffer.current[2].push(currentEma);

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
            vibRef.current?.updateValue(currentEma);
            tempRef.current?.updateValue(activePayload.c);

            rpmChartRef.current?.updateData(rpmBuffer.current as AlignedData);
            vibChartRef.current?.updateData(vibBuffer.current as AlignedData);
            tempChartRef.current?.updateData(tempBuffer.current as AlignedData);

            schematicRef.current?.updateRpmValue(activePayload.r);
            schematicRef.current?.updateVibValue(currentEma);
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
        console.error('[HMI] Worker parse error', err);
      }
    };

    // Data-stale watchdog: if no data for 2s while supposedly connected, go STALE
    const watchdogId = setInterval(() => {
      if (connStatusRef.current === 'CONNECTED' && Date.now() - lastSeenRef.current > 2000) {
        console.warn('[HMI] Data stale — no messages for 2s');
        setConnStatus('STALE');
        connStatusRef.current = 'STALE';
      }
    }, 1000);

    return () => {
      clearInterval(watchdogId);
      simWorker.terminate();
      simWorkerRef.current = null;
    };
  }, []);


  // ─── Actions ─────────────────────────────────────────────────
  const send = (type: string): void => {
    // Determine the target: if in overview, use the overview target dropdown selection
    const targetId = selectedTurbine === 'OVERVIEW' ? overviewTarget : selectedTurbine;
    simWorkerRef.current?.postMessage({ type, targetId });
  };

  const exportIncident = (): void => {
    historianRef.current.exportCSV(selectedTurbine);
  };

  const isConnected = connStatus === 'CONNECTED';

  // ─── Sidebar Render Helpers ───────────────────────────────────
  const renderStatusIcon = (rul: number, tempStatus?: string, vib: number = 0) => {
    const isCritical = rul < RUL_LIMITS.critical || tempStatus === 'critical' || vib >= VIB_LIMITS.critical;
    const isWarning = rul < RUL_LIMITS.warning || tempStatus === 'warning' || vib >= VIB_LIMITS.warning;

    // Critical: Boxed X
    if (isCritical) return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--hmi-alarm-critical)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2" />
        <path d="M8 8l8 8M16 8l-8 8" />
      </svg>
    );
    // Warning: Filled larger triangle with inner exclamation
    if (isWarning) return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--hmi-alarm-warning)" stroke="var(--hmi-alarm-warning)" strokeWidth="1">
        <path d="M12 2L22 20H2Z" />
        <path d="M12 9v4" stroke="#2d2001" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="#2d2001" />
      </svg>
    );
    // Hollow Circle for Nominal
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><circle cx="12" cy="12" r="10" /></svg>;
  };

  // ─── Connection Status Label ─────────────────────────────────
  const connLabel = connStatus === 'CONNECTED' ? '50Hz Live'
    : connStatus === 'STALE' ? 'DATA STALE'
      : connStatus === 'RECONNECTING' ? 'RECONNECTING'
        : 'DISCONNECTED';

  const connDotColor = connStatus === 'CONNECTED' ? 'var(--hmi-accent)'
    : connStatus === 'STALE' ? 'var(--hmi-alarm-warning)'
      : '#475569';

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
            {Object.values(fleetState).some(p => p.estimatedRUL < RUL_LIMITS.warning || p.smoothedVibration >= VIB_LIMITS.warning || p.temperatureStatus !== 'nominal') && (
              renderStatusIcon(
                Math.min(...Object.values(fleetState).map(p => p.estimatedRUL)),
                Object.values(fleetState).some(p => p.temperatureStatus === 'critical') ? 'critical' : Object.values(fleetState).some(p => p.temperatureStatus === 'warning') ? 'warning' : 'nominal',
                Math.max(...Object.values(fleetState).map(p => p.smoothedVibration))
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
              {renderStatusIcon(fleetState[id] ? fleetState[id].estimatedRUL : 999, fleetState[id]?.temperatureStatus, fleetState[id]?.smoothedVibration)}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {selectedTurbine === 'OVERVIEW' && (
                <select
                  className="hmi-btn"
                  value={overviewTarget}
                  onChange={e => setOverviewTarget(e.target.value)}
                  disabled={!isConnected}
                  style={{ opacity: isConnected ? 1 : 0.4, padding: '7px 12px', background: 'var(--hmi-bg-deep)' }}
                >
                  {TURBINES.map(t => <option key={t} value={t}>{t} Target</option>)}
                </select>
              )}
              <button className="hmi-btn" onClick={() => send('INJECT_FAULT')} disabled={!isConnected} style={{ opacity: isConnected ? 1 : 0.4 }}>Bearing Fault</button>
              <button className="hmi-btn" onClick={() => send('THERMAL_RUNAWAY')} disabled={!isConnected} style={{ opacity: isConnected ? 1 : 0.4 }}>Thermal Runaway</button>
              <button className="hmi-btn" onClick={() => send('CLEAR_FAULT')} disabled={!isConnected} style={{ opacity: isConnected ? 1 : 0.4 }}>Clear All</button>
              {selectedTurbine !== 'OVERVIEW' && (
                <>
                  <div style={{ width: '1px', height: '24px', background: 'var(--hmi-border)' }}></div>
                  <button className="hmi-btn" onClick={exportIncident}>Export Incident Report</button>
                </>
              )}
              <div style={{ width: '1px', height: '24px', background: 'var(--hmi-border)' }}></div>
              <div className="live-indicator">
                <div className="live-dot" style={connStatus !== 'CONNECTED' ? { '--dot-color': connDotColor } as React.CSSProperties : undefined}>
                  {connStatus !== 'CONNECTED' && (
                    <style>{`.live-dot::before, .live-dot::after { background: ${connDotColor} !important; }`}</style>
                  )}
                </div>
                <span className="live-text" style={{ color: connStatus === 'STALE' ? 'var(--hmi-alarm-warning)' : connStatus === 'CONNECTED' ? 'var(--hmi-text-muted)' : '#475569' }}>{connLabel}</span>
              </div>
            </div>
          </header>

          {selectedTurbine === 'OVERVIEW' && (
            <FleetOverview fleetState={fleetState} fleetTelemetry={fleetTelemetry} onDrillDown={setSelectedTurbine} connStatus={connStatus} />
          )}

          {selectedTurbine !== 'OVERVIEW' && (
            <>
              {/* Warning Banner Overlay */}
              <div ref={warningRef} className="warning-banner" style={{ display: 'none' }}>
                <svg ref={warningIconRef} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="fault-pulse" style={{ flexShrink: 0 }}>
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
                <div className="schematic-diagnostics-col">
                  <DigitalTwinSchematic ref={schematicRef} />
                  <DiagnosticsPanel
                    turbineId={selectedTurbine}
                    payload={currentPayload}
                    pdmState={fleetState[selectedTurbine]}
                    connStatus={connStatus}
                  />
                </div>

                {/* Right Column: Stacked Charts */}
                <div className="charts-stack">
                  <TelemetryChart ref={rpmChartRef} title="Rotor Speed" config={RPM_CONFIG} height={150} info={CHART_INFO.rpm} />
                  <TelemetryChart ref={vibChartRef} title="Bearing Vibration" config={VIB_CONFIG} height={150} info={CHART_INFO.vib} />
                  <TelemetryChart ref={tempChartRef} title="Combustor Temp" config={TEMP_CONFIG} height={150} info={CHART_INFO.temp} />
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