# GazeUI - Real-Time Webcam Eye Gaze Tracking and Hands-Free Interaction Simulator

GazeUI is an intuitive, visual, and highly interactive hands-free computer control dashboard. It provides real-time webcam-based eye-gaze tracking, physical gaze point smoothing, on-the-fly polynomial calibration, and a hands-free interactive environment designed for assistive-technology research and development.

---

## Key Features

### 1. Webcam Tracking and Simulation
*   **Webcam Mode**: Scans pupil centroids within crop window channels to map eye shifts into screen-space inputs.
*   **Sim Mode**: Instantly toggle to mouse coordinates placeholder to test screen elements manually when camera feeds are restricted or unavailable.
*   **Dual Selection Channels**: Select visual anchors via dwell timing (holding the gaze within visual radius) or blink detection (shutting the eyes to click).

### 2. Live Gaze Stability Waveform Stream
*   Powered by the recharts library, the Real-Time Gaze Stability Chart renders a rolling 30-second timeline comparing raw pupil centroids with smoothed and filtered gaze vectors.
*   Toggle horizontal (X), vertical (Y), and raw signals individually to visualize the damping properties of exponential filters under varying tracking conditions.
*   Telemetry readout provides current peak-to-peak variance and filtered screen coordinates in real time.

### 3. Interactive Blink Training Station
*   An advanced practice arena displaying target circles in sequential stations.
*   Each target issues a three-second countdown. Once it transforms into an active state of green, blinking deliberately triggers a selection, facilitating the calibration of thresholds.
*   Monitors live performance results (Strike Rate, target accuracy, and threshold variance), enabling custom fine-tuning of parameters.

### 4. Polynomial Calibration Engine
*   Offers customizable 5-point and 9-point calibration schemes.
*   Computes interactive regression matrices to resolve mean coordinate drift (MAE) and align raw camera offsets with screen coordinates.

### 5. Instant Event Timeline
*   Animates live physical selection logs (dwell activations, calibrated target registrations, and eye blinking actions) with fluid, snappy spring transitions.

---

## Codebase Structure

*   `src/App.tsx`: Main environment container coordinating the simulated state, layout wrapper, event dispatcher, and settings parameters.
*   `src/components/GazeCursor.tsx`: Smooth, low-latency target cursor tracking powered by snapped physical spring mechanics.
*   `src/components/GazeStabilityChart.tsx`: A real-time Recharts dashboard displaying raw versus stabilized coordinate signals over rolling timelines.
*   `src/components/BlinkTraining.tsx`: Target station components guiding deliberate blink triggers, using synthesizer frequencies for audible validation flags.
*   `src/components/WebcamTracker.tsx`: Computer-vision canvas scanning pupil landmarks and tracking live aspect changes to register closures.
*   `src/types.ts`: TypeScript configurations detailing parameters and unified gaze data schemas.

---

## Running Locally

### Prerequisites
Node.js (v18 or higher) must be installed.

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Launch Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000` to preview.

3. **Verify Linter**:
   ```bash
   npm run lint
   ```

4. **Production Build**:
   ```bash
   npm run build
   ```

---

## Deploying to Netlify

GazeUI is fully compatible with Netlify's one-click deployment architecture.

### Deployment Configuration (netlify.toml)
The repository includes a custom pre-configured `netlify.toml` which controls build environments, optimizes script compilations, and routes assets seamlessly:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Steps to Deploy via Netlify CLI:
1. Install Netlify's Command Line Tool:
   ```bash
   npm install -g netlify-cli
   ```
2. Log in and initialize deployment:
   ```bash
   netlify login
   ```
3. Link your path and execute production deployment:
   ```bash
   netlify deploy --prod
   ```

### Deploying via Web Console:
1. Run `npm run build` locally to produce the static `dist` bundle.
2. Log into the Netlify App Console.
3. Upload the static `dist` directory directly onto the Netlify dashboard to deploy on global CDN servers.
