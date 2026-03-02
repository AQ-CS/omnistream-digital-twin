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

        const phaseOffset = i * 1000;

        // r (RPM): SGT-800 Base 6600 RPM + slight mechanical noise
        payload.r = 6600 + Math.sin((tick + phaseOffset) / 500) * 20 + (Math.random() - 0.5) * 5;

        // c (Exhaust Temperature): Nominal 596°C ± 2°C slow drift
        let cBase = 596 + Math.sin((tick + phaseOffset) / 1000) * 2 + (Math.random() - 0.5) * 0.5;

        let vAmp = 1.5;
        let vNoise = 1.0;

        if (isThermalRunaway && payload.id === activeThermalTarget) {
            // Gradually raise from 596 → 641°C over 120 seconds
            const elapsed = now - thermalStartTime;
            const progress = Math.min(elapsed / 120000, 1.0);
            cBase += 45 * progress; // +45°C at full progression
            cBase += (Math.random() - 0.5) * 3.0 * progress;
        }

        if (isFaultActive && payload.id === activeFaultTarget) {
            const elapsed = now - faultStartTime;
            const progress = Math.min(elapsed / 60000, 1.0);
            vAmp = 1.5 + (13.5 * progress);
            vNoise = 1.0 + (5.0 * progress);
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
