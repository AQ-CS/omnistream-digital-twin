const http = require('http');
const WebSocket = require('ws');

// ─── State Pre-allocation ────────────────────────────────────

// Three turbines
const fleet = [
    { id: 'T-01', t: 0, r: 0, v: 0, c: 0 },
    { id: 'T-02', t: 0, r: 0, v: 0, c: 0 },
    { id: 'T-03', t: 0, r: 0, v: 0, c: 0 }
];

// Faults only apply to T-03
let isFaultActive = false;
let faultStartTime = 0;

let isThermalRunaway = false;
let thermalStartTime = 0;

// ─── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/inject-fault') {
        isFaultActive = true;
        faultStartTime = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Bearing fault active on T-03' }));
    } else if (req.method === 'POST' && req.url === '/thermal-runaway') {
        isThermalRunaway = true;
        thermalStartTime = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Thermal runaway active on T-03' }));
    } else if (req.method === 'POST' && req.url === '/clear-fault') {
        isFaultActive = false;
        faultStartTime = 0;
        isThermalRunaway = false;
        thermalStartTime = 0;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'All faults cleared' }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

// ─── WebSocket Server ────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('close', () => console.log('Client disconnected'));
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'INJECT_FAULT' || data.type === 'inject_fault') {
                isFaultActive = true;
                faultStartTime = Date.now();
                console.log('[FAULT] Bearing fault injected on T-03');
            } else if (data.type === 'THERMAL_RUNAWAY') {
                isThermalRunaway = true;
                thermalStartTime = Date.now();
                console.log('[FAULT] Thermal runaway injected on T-03');
            } else if (data.type === 'CLEAR_FAULT') {
                isFaultActive = false;
                faultStartTime = 0;
                isThermalRunaway = false;
                thermalStartTime = 0;
                console.log('[FAULT] All faults cleared');
            }
        } catch (e) {
            // ignore non-JSON messages
        }
    });
});

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

        // Fault logic applied ONLY to T-03
        if (payload.id === 'T-03') {
            if (isThermalRunaway) {
                // Gradually raise from 900 → 960°C over 120 seconds
                const elapsed = now - thermalStartTime;
                const progress = Math.min(elapsed / 120000, 1.0); // 0→1 over 120s
                cBase += 60 * progress; // +60°C at full progression
                // Add increasing noise as thermal instability grows
                cBase += (Math.random() - 0.5) * 3.0 * progress;
            }

            if (isFaultActive) {
                // Bearing degradation over 60s
                const elapsed = now - faultStartTime;
                const progress = Math.min(elapsed / 60000, 1.0); // 0→1 over 60s
                vAmp = 1.5 + (13.5 * progress);    // → 15.0
                vNoise = 1.0 + (5.0 * progress);   // → 6.0
            }
        }

        payload.c = cBase;
        payload.v = Math.sin((tick + phaseOffset) / 10) * vAmp + (Math.random() - 0.5) * vNoise;
    }
}

// ─── 50Hz Broadcast Loop ────────────────────────────────────
setInterval(() => {
    mutateFleet();
    const jsonStr = JSON.stringify(fleet); // Array of 3 payloads
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonStr);
        }
    }
}, 20);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`[🚀] Gas Turbine Simulator on port ${PORT} @ 50Hz`);
    console.log(`[⚙️] Fleet: T-01, T-02, T-03 (Multiplexed)`);
    console.log(`[⚙️] Baselines: RPM ~3600, Vibration ~1.5 mm/s, Combustor ~900°C`);
    console.log(`[🔌] Faults: INJECT_FAULT | THERMAL_RUNAWAY | CLEAR_FAULT (Targets T-03 only)`);
});
