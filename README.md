# OmniStream Digital Twin 🏭
**A high-frequency industrial telemetry and edge-compute sandbox.**

I usually spend 80% of my time building Istiqama, but I'm a big believer in Google's "20% Time" philosophy. I used my 20% innovation time this weekend to dive into industrial software architecture, specifically exploring how to handle 50Hz multiplexed telemetry within a standard web browser without melting the main thread.

This Proof-of-Concept (PoC) is a mathematical digital twin of a 3-turbine fleet, specifically modeled after the **Siemens Energy SGT-800** gas turbine. It’s built to test the absolute limits of React, Web Workers, and High-Performance HMI (Human-Machine Interface) design principles.

---

## 🏗️ OmniStream PoC vs. Real-World SCADA

To keep this runnable entirely in the browser (via Vercel), I had to make some strategic architectural trade-offs compared to a massive heavy-industry system like Siemens PCS 7 or SPPA-T3000. 

| Architectural Layer | Real-World Gas Turbine | OmniStream Digital Twin (PoC) |
| :--- | :--- | :--- |
| **Data Acquisition** | Physical piezoelectric accelerometers and thermocouples wired to PLCs. | A dedicated Web Worker (`simulation.worker.ts`) generating phase-offset mathematical sine waves with injected noise. |
| **Telemetry Frequency** | Raw vibration is sampled at 10kHz+ at the edge. Controllers perform FFTs and only transmit 1Hz-5Hz summarized data to the HMI. | Simulates raw high-frequency transmission by pushing **50Hz multiplexed JSON payloads** directly to the browser to artificially stress-test the frontend UI. |
| **Transmission Protocol**| Hard-real-time industrial protocols like PROFINET, Modbus TCP, or OPC UA over isolated fiber networks. | Browser MessageChannels, utilizing highly compressed JSON payloads to simulate embedded memory constraints. |
| **HMI Rendering Engine**| Heavy, native "thick clients" running on dedicated control room workstations. | React + Vite, specifically bypassing standard React `useState` reconciliation using `useRef` and Canvas (`uPlot`) to achieve a zero-latency, 60fps render loop. |
| **Predictive Maintenance**| Cloud-based Machine Learning models analyzing petabytes of historical fleet data for complex pattern recognition. | **Agentic Edge Compute:** An isolated Web Worker (`pdm.worker.ts`) executing rolling Exponential Moving Averages (EMA) and Least-Squares Linear Regression matrices locally. |

---

## 🧠 The Architecture (Building the Pipeline)

If you try to shove 50 updates per second into React's `useState`, the Virtual DOM will crash your browser within seconds. I had to architect a completely decoupled data pipeline:

1. **The Ingestion Engine (`simulation.worker.ts`):** Acts as the edge device. It runs a `setInterval` loop every 20ms, simulating physics and mechanical noise for 3 multiplexed turbines. It precisely models the baseline physics of the SGT-800 (6,600 RPM core, 596°C exhaust).
2. **The Predictive Maintenance Engine (`pdm.worker.ts`):** This is the brains. I moved all the heavy math into an isolated Web Worker. It uses memory-safe `Float64Array` circular buffers to run a rolling Exponential Moving Average (EMA) and a Least-Squares Linear Regression to calculate real-time **Remaining Useful Life (RUL)**. 
3. **The Rendering Layer (`App.tsx` & `uPlot`):** The React component intercepts the 50Hz data using `useRef` and imperatively mutates the HTML5 `<canvas>` elements and specific DOM nodes. React state is intentionally throttled to ~2Hz just to handle structural layout changes.

### 🔌 The "AI Injection Point"
The math driving the Remaining Useful Life (RUL) countdown in this PoC is a simple linear regression. I know real turbine degradation is highly non-linear! However, I specifically built this Web Worker architecture to be an **injection point for a production AI model**. 

The pipeline is fully prepped to swap out the linear regression matrix for an edge-optimized LSTM or Transformer model trained on run-to-failure data. I built the nervous system; it's ready for the brain.

---

## 🎨 The Torturous Details: ISA-101 Design Principles

I didn't just want this to look like a generic web app; I wanted it to look like a real control room. I fell down the rabbit hole of **ANSI/ISA-101.01-2015** (High-Performance HMIs) and built a dynamic, 2.5D volumetric SVG schematic governed strictly by modern SCADA standards:

* **Muted Backgrounds:** The base palette is dark industrial slate (`#0f172a`). There are no bright UI elements fighting for attention.
* **Alarm By Exception:** You will not see the colors Red, Orange, or Yellow anywhere unless something is actively breaking. When a Bearing Fault is injected, the UI physically transforms to grab operator attention.
* **Shape Redundancy (Accessibility):** Relying only on color gets people killed if an operator is colorblind. Alarms use redundant shape coding: a **Hollow Circle** for nominal, a **Filled Triangle** for warnings, and a **Boxed X / Red Outline** for critical failures.
* **Tabular Numbers:** At 50Hz, standard fonts cause the dashboard to jitter violently as character widths change. I forced `font-variant-numeric: tabular-nums` alongside `JetBrains Mono` so the telemetry streams perfectly in place.
* **Component-Level Causality:** If you trigger a Thermal Runaway, the 2.5D schematic doesn't just flash a generic warning—it specifically turns the Annular Combustor red to visually isolate the exact root cause of the failure.

---

## 📚 References & Source Material

To ensure the telemetry and schematic architecture were grounded in reality, this simulation references the official technical specifications and P&ID layouts of the Siemens Energy SGT-800:

* **Siemens Energy SGT-800 Technical Overview:** [Official Product Page](https://www.siemens-energy.com/global/en/home/products-services/product/sgt-800.html#/)
* **Control Room Interface & Operator HMI Reference (WinCC / PCS 7):** [DIVA Academic Archive (PDF)](https://www.diva-portal.org/smash/get/diva2:1467470/FULLTEXT01.pdf)
* **ISA-101 High-Performance HMI Design:** [Graham Nasby SCADA Standards (PDF)](https://www.grahamnasby.com/files_publications/NasbyG_2017_HighPerformanceHMIs_IntelligentWastewaterSeminar_WEAO_sept14-2017_slides-public.pdf)
---

## 🚀 Running the Sandbox
If you want to see the application in action:

**[Live Demo on Vercel](https://omnistream-digital-twin.vercel.app/)**

Want to inject a bearing fault locally and watch the math work?

```bash
# Clone the repo and go to client folder
cd client

# Install dependencies
npm install

# Start the Vite development server
npm run dev