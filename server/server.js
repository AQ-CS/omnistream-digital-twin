const http = require('http');
const WebSocket = require('ws');

// ─── State Pre-allocation ────────────────────────────────────
const payload = { t: 0, r: 0, v: 0, c: 0 };

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
        res.end(JSON.stringify({ success: true, message: 'Bearing fault active' }));
    } else if (req.method === 'POST' && req.url === '/thermal-runaway') {
        isThermalRunaway = true;
        thermalStartTime = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Thermal runaway active' }));
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
                console.log('[FAULT] Bearing fault injected');
            } else if (data.type === 'THERMAL_RUNAWAY') {
                isThermalRunaway = true;
                thermalStartTime = Date.now();
                console.log('[FAULT] Thermal runaway injected');
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

function mutatePayload() {
    tick += 1;
    payload.t = Date.now();

    // r (RPM): Base 3600 + low-frequency sine wave + slight noise
    payload.r = 3600 + Math.sin(tick / 500) * 50 + (Math.random() - 0.5) * 5;

    // c (Combustor Temperature): Nominal 900°C ± 10°C slow drift
    let cBase = 900 + Math.sin(tick / 1000) * 10 + (Math.random() - 0.5) * 1.0;

    if (isThermalRunaway) {
        // Gradually raise from 900 → 960°C over 120 seconds
        const elapsed = Date.now() - thermalStartTime;
        const progress = Math.min(elapsed / 120000, 1.0); // 0→1 over 120s
        cBase += 60 * progress; // +60°C at full progression
        // Add increasing noise as thermal instability grows
        cBase += (Math.random() - 0.5) * 3.0 * progress;
    }

    payload.c = cBase;

    // v (Vibration): Nominal ±1.5 mm/s amplitude
    let vAmp = 1.5;
    let vNoise = 1.0;

    if (isFaultActive) {
        const elapsed = Date.now() - faultStartTime;
        const progress = Math.min(elapsed / 60000, 1.0); // 0→1 over 60s
        vAmp = 1.5 + (13.5 * progress);    // → 15.0
        vNoise = 1.0 + (5.0 * progress);   // → 6.0
    }

    payload.v = Math.sin(tick / 10) * vAmp + (Math.random() - 0.5) * vNoise;
}

// ─── 50Hz Broadcast Loop ────────────────────────────────────
setInterval(() => {
    mutatePayload();
    const jsonStr = JSON.stringify(payload);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonStr);
        }
    }
}, 20);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`[🚀] Gas Turbine Simulator on port ${PORT} @ 50Hz`);
    console.log(`[⚙️] Baselines: RPM ~3600, Vibration ~1.5 mm/s, Combustor ~900°C`);
    console.log(`[🔌] Faults: INJECT_FAULT | THERMAL_RUNAWAY | CLEAR_FAULT`);
});
