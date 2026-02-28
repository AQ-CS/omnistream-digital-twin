import type { TelemetryPayload } from '../types/telemetry';

// ─── State Pre-allocation ────────────────────────────────────

// Three turbines
const fleet: TelemetryPayload[] = [
    { id: 'T-01', t: 0, r: 0, v: 0, c: 0 },
    { id: 'T-02', t: 0, r: 0, v: 0, c: 0 },
    { id: 'T-03', t: 0, r: 0, v: 0, c: 0 }
];

// Fault targeting
let activeFaultTarget: string | null = null;
let isFaultActive = false;
let faultStartTime = 0;

let activeThermalTarget: string | null = null;
let isThermalRunaway = false;
let thermalStartTime = 0;

// ─── Command Handling ────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
    const { type, targetId } = e.data;
    if (type === 'INJECT_FAULT' || type === 'inject_fault') {
        if (!targetId) return console.warn('[FAULT] Ignored: no targetId specified');
        isFaultActive = true;
        activeFaultTarget = targetId;
        faultStartTime = Date.now();
        console.log(`[FAULT] Bearing fault injected on ${activeFaultTarget}`);
    } else if (type === 'THERMAL_RUNAWAY') {
        if (!targetId) return console.warn('[FAULT] Ignored: no targetId specified');
        isThermalRunaway = true;
        activeThermalTarget = targetId;
        thermalStartTime = Date.now();
        console.log(`[FAULT] Thermal runaway injected on ${activeThermalTarget}`);
    } else if (type === 'CLEAR_FAULT') {
        isFaultActive = false;
        activeFaultTarget = null;
        faultStartTime = 0;
        isThermalRunaway = false;
        activeThermalTarget = null;
        thermalStartTime = 0;
        console.log('[FAULT] All faults cleared');
    }
};

// ─── Signal Generation ───────────────────────────────────────
let tick = 0;

function mutateFleet() {
    tick += 1;
    const now = Date.now();

    for (let i = 0; i < fleet.length; i++) {
        const payload = fleet[i];
        payload.t = now;

        // Distinct phase offset per turbine
        const phaseOffset = i * 1000;

        // r (RPM): Base 3600 + low-frequency sine wave + slight noise
        payload.r = 3600 + Math.sin((tick + phaseOffset) / 500) * 50 + (Math.random() - 0.5) * 5;

        // c (Combustor Temperature): Nominal 900°C ± 10°C slow drift
        let cBase = 900 + Math.sin((tick + phaseOffset) / 1000) * 10 + (Math.random() - 0.5) * 1.0;

        // v (Vibration): Nominal ±1.5 mm/s amplitude
        let vAmp = 1.5;
        let vNoise = 1.0;

        // Fault logic applied dynamically
        if (isThermalRunaway && payload.id === activeThermalTarget) {
            // Gradually raise from 900 → 960°C over 120 seconds
            const elapsed = now - thermalStartTime;
            const progress = Math.min(elapsed / 120000, 1.0); // 0→1 over 120s
            cBase += 60 * progress; // +60°C at full progression
            // Add increasing noise as thermal instability grows
            cBase += (Math.random() - 0.5) * 3.0 * progress;
        }

        if (isFaultActive && payload.id === activeFaultTarget) {
            // Bearing degradation over 60s
            const elapsed = now - faultStartTime;
            const progress = Math.min(elapsed / 60000, 1.0); // 0→1 over 60s
            vAmp = 1.5 + (13.5 * progress);    // → 15.0
            vNoise = 1.0 + (5.0 * progress);   // → 6.0
        }

        payload.c = cBase;
        payload.v = Math.sin((tick + phaseOffset) / 10) * vAmp + (Math.random() - 0.5) * vNoise;
    }
}

// ─── 50Hz Broadcast Loop ────────────────────────────────────
setInterval(() => {
    mutateFleet();
    self.postMessage(fleet);
}, 20);
