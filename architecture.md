# OmniStream Digital Twin: Project Architecture & Context
**Target:** Siemens Energy Technical Proof-of-Concept
**Core Goal:** Demonstrate high-performance, industrial-grade telemetry handling, zero-latency React architecture, and adherence to ISA-101 HMI standards.

## 1. System Architecture
- **Backend (Turbine Simulator):** Node.js WebSocket (WS) Server. Generates continuous sine-wave data with random noise to simulate a physical gas turbine.
- **Transmission:** 50Hz (50 updates per second).
- **Payload Structure:** Highly compressed JSON to simulate embedded C++ constraints. 
  - Format: `{ t: timestamp, r: RPM, v: vibration_hz, c: combustor_temp_c }`
- **Fault Injection Pipeline:** The WebSocket server includes an `inject_fault` listener. When triggered by the frontend UI, it mathematically degrades the simulated bearing vibration over a 60-second window to test the forecasting algorithms.
- **Frontend:** React + Vite + TypeScript.
- **Rendering Engine:** uPlot or Apache ECharts (Canvas/WebGL). STRICT RULE: No SVG-based charting (e.g., Recharts) due to React DOM reconciliation crashing at 50Hz.
- **State Management:** Bypass React `useState` for high-frequency telemetry. Use `useRef` to catch WebSocket packets and mutate the `<canvas>` DOM directly.

## 2. UI/UX Principles (ISA-101 Standards)
- **Color Palette:** Monochromatic base (dark slate `#1e293b`). 
- **Alarm By Exception:** Never use red, orange, or yellow for generic UI elements. These are strictly reserved for threshold alarms.
- **Typography:** CSS MUST include `font-variant-numeric: tabular-nums` to prevent layout jitter from rapidly changing telemetry numbers.
- **Layout:** Level-1 overview, drilling down to Level-3 specific sensor charts. Include a 2D digital twin schematic where individual nodes glow based on threshold states.

## 3. Advanced Features (The "Wow" Factor)
- **Predictive Maintenance (PdM) & Remaining Useful Life (RUL):** The system implements a real-time condition monitoring algorithm. It uses an Exponential Moving Average (EMA) to smooth out the noisy 50Hz vibration data.
- **Agentic Forecasting:** Employs a rolling Least Squares Linear Regression to calculate the deterioration slope of the smoothed data. It projects this slope against a critical failure threshold to dynamically display the equipment's Remaining Useful Life (RUL) in seconds, triggering an automated warning before actual failure occurs.