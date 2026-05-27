import { useState, useEffect, useRef } from 'react';
import { GazeConfig, GazeState, GazeEvent } from './types';
import { GazeSmoother } from './utils/filter';
import { CalibrationEngine } from './utils/calibration';
import { CalibrationWizard } from './components/CalibrationWizard';
import { MainOverlay } from './components/MainOverlay';
import { GazeCursor } from './components/GazeCursor';
import { Eye, Settings, RefreshCw, Sparkles, Github } from 'lucide-react';

const DEFAULT_CONFIG: GazeConfig = {
  camera: {
    width: 640,
    height: 480,
    fps: 30,
  },
  tracking: {
    smoothingAlpha: 0.5,
    kalmanProcessNoise: 0.015,
    kalmanMeasurementNoise: 8.0,
    sensitivity: 4.5,
  },
  selection: {
    mode: 'dwell',
    dwellDurationMs: 1500,
    dwellRadiusPx: 60,
    blinkEarThreshold: 0.21,
    blinkMinDurationMs: 150,
    blinkMaxDurationMs: 400,
    cooldownMs: 500,
  },
  calibration: {
    points: 9,
    sampleDurationS: 1.0,
    polynomialDegree: 2,
  },
  ui: {
    cursorSize: 22,
    cursorColor: '#10b981',
    dwellRingColor: '#f97316',
    showDebugOverlay: true,
    audioFeedback: true,
  },
};

export default function App() {
  const [config, setConfig] = useState<GazeConfig>(DEFAULT_CONFIG);
  
  // High-fidelity local states
  const [useSimMode, setUseSimMode] = useState<boolean>(true);
  const [calibrationEngine, setCalibrationEngine] = useState<CalibrationEngine | null>(null);
  const [maeError, setMaeError] = useState<number | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardPoints, setWizardPoints] = useState<5 | 9>(9);

  const [gazeState, setGazeState] = useState<GazeState>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    rawX: window.innerWidth / 2,
    rawY: window.innerHeight / 2,
    gazeVector: [0, 0],
    confidence: 1.0,
    isTracking: true,
    isFacePresent: true,
    earCount: 0.35, // Eye aspect ratio placeholder (blink tracker)
    isDwellActive: false,
    dwellProgress: 0,
    fps: 30,
  });

  const [events, setEvents] = useState<GazeEvent[]>([]);
  const [mousePos, setMousePos] = useState<[number, number]>([window.innerWidth / 2, window.innerHeight / 2]);

  // Filters and math references
  const smootherRef = useRef(new GazeSmoother());
  const fpsFrameCountRef = useRef(0);
  const fpsLastTimeRef = useRef(Date.now());
  const [currentFps, setCurrentFps] = useState(30);

  // Add system telemetry console log helper
  const addEvent = (type: GazeEvent['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const newEvent: GazeEvent = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp,
    };
    setEvents((prev) => [newEvent, ...prev].slice(0, 80)); // limit logs to 80 records
  };

  // Setup initial notifications
  useEffect(() => {
    addEvent('INFO', 'GazeUI Hands-Free Kernel initialised.');
    addEvent('INFO', 'Ready to acquire face target vectors. Choose tracking inputs below.');
  }, []);

  // Update dynamic FPS metrics
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - fpsLastTimeRef.current;
      if (elapsed >= 1000) {
        const measuredFps = (fpsFrameCountRef.current / elapsed) * 1000;
        setCurrentFps(Math.max(15, Math.min(60, measuredFps)));
        fpsFrameCountRef.current = 0;
        fpsLastTimeRef.current = now;

        setGazeState((prev) => ({ ...prev, fps: parseFloat(measuredFps.toFixed(1)) }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync filter alpha variables to the engine
  useEffect(() => {
    smootherRef.current.setParams(
      config.tracking.smoothingAlpha,
      config.tracking.kalmanProcessNoise,
      config.tracking.kalmanMeasurementNoise
    );
  }, [config.tracking]);

  // Handle dwell progress feedback animations emitted from MainOverlay triggers
  useEffect(() => {
    const handleDwellUpdate = (e: any) => {
      const { progress, isActive } = e.detail;
      setGazeState((prev) => ({
        ...prev,
        dwellProgress: progress,
        isDwellActive: isActive,
      }));
    };
    window.addEventListener('gazeui-dwell-update', handleDwellUpdate);
    return () => window.removeEventListener('gazeui-dwell-update', handleDwellUpdate);
  }, []);

  // Listening to real Webcam coordinates
  useEffect(() => {
    if (useSimMode) return;

    const handleWebcamCoordinate = (e: any) => {
      const { gx, gy, ear } = e.detail;
      
      // Track FPS ticker
      fpsFrameCountRef.current++;

      let screenX = window.innerWidth / 2;
      let screenY = window.innerHeight / 2;

      if (calibrationEngine) {
        // Project vector using our calibrated 2nd-degree Ridge polynomial matrices
        const [cx, cy] = calibrationEngine.transform(gx, gy);
        screenX = cx;
        screenY = cy;
      } else {
        // Direct linear boundaries fallback projection of coordinates with configurable sensitivity.
        // We invert the horizontal X axis so looking left moves the cursor left!
        const sens = config.tracking.sensitivity ?? 4.5;
        screenX = window.innerWidth / 2 - gx * sens * (window.innerWidth / 2);
        screenY = window.innerHeight / 2 + gy * sens * (window.innerHeight / 2);
      }

      // Constrain inside viewport boundaries
      screenX = Math.max(0, Math.min(window.innerWidth - 10, screenX));
      screenY = Math.max(0, Math.min(window.innerHeight - 10, screenY));

      // Pass coordinates through our Kalman + EMA spatial smoother filters
      const [smoothX, smoothY] = smootherRef.current.update(screenX, screenY);

      setGazeState((prev) => ({
        ...prev,
        rawX: screenX,
        rawY: screenY,
        x: smoothX,
        y: smoothY,
        gazeVector: [gx, gy],
        earCount: ear,
        isFacePresent: true,
      }));
    };

    window.addEventListener('gazeui-coordinate-update', handleWebcamCoordinate);
    return () => window.removeEventListener('gazeui-coordinate-update', handleWebcamCoordinate);
  }, [useSimMode, calibrationEngine]);

  // Listening to mouse as gaze vectors in SimMode
  useEffect(() => {
    if (!useSimMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      fpsFrameCountRef.current++;

      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // Pass simulated cursor coordinate through the Kalman filter to mimic physiological eye latency!
      const [smoothX, smoothY] = smootherRef.current.update(mouseX, mouseY);

      // Back-calculate mock normalized gaze vector for the calibration grid algorithm
      const simulatedGx = (mouseX / window.innerWidth - 0.5) * 2;
      const simulatedGy = (mouseY / window.innerHeight - 0.5) * 2;

      setGazeState((prev) => ({
        ...prev,
        rawX: mouseX,
        rawY: mouseY,
        x: smoothX,
        y: smoothY,
        gazeVector: [simulatedGx, simulatedGy],
        earCount: 0.35, // default open state
      }));
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [useSimMode]);

  // Hook to simulate deliberate blinks with Keyboard Space in Simulation Gaze Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && useSimMode) {
        e.preventDefault();
        // Trigger simulated closed-eye state
        setGazeState((prev) => ({ ...prev, earCount: 0.05 }));
        addEvent('SINGLE_BLINK', 'Space bar key blink code detected. Event fired');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && useSimMode) {
        setGazeState((prev) => ({ ...prev, earCount: 0.35 }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [useSimMode]);

  const handleCalibrationComplete = (engine: CalibrationEngine, mae: number) => {
    setCalibrationEngine(engine);
    setMaeError(mae);
    setIsWizardOpen(false);

    addEvent(
      'CALIBRATION_POINT',
      `Calibration matrices compiled successfully! Mean pixel drift error: ${mae.toFixed(1)}px`
    );
  };

  const triggerCalibrationWizard = (points: 5 | 9) => {
    setWizardPoints(points);
    setIsWizardOpen(true);
    addEvent('INFO', `Initializing Calibration sequence: ${points}-Point grid target setup...`);
  };

  return (
    <main className="min-h-screen relative bg-[#F5F5F3] text-[#121212] flex flex-col font-sans selection:bg-black/10 select-none pb-12">
      
      {/* Structural subtle blueprint lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(18,18,18,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(18,18,18,0.03)_1px,transparent_1px)] bg-[size:5rem_5rem] pointer-events-none" />
      <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black/5 pointer-events-none" />

      {/* Cyberpunk Top Utility Status Rail */}
      <header className="relative w-full border-b border-black bg-[#F5F5F3] px-6 py-5 flex items-center justify-between pointer-events-auto z-40">
        <div className="flex items-start gap-4">
          <div className="space-y-1">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">System</h2>
            <h1 className="text-sm font-bold tracking-widest text-[#121212] uppercase leading-none">
              GAZEUI / APERTURE FLUX
            </h1>
          </div>
        </div>

        {/* Ambient indicator lights */}
        <div className="flex items-center gap-6 text-[10px] font-mono tracking-wider">
          <div className="hidden sm:flex items-center gap-2 border-b border-black/10 pb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600 font-extrabold font-mono uppercase">LOCAL_ENGINE: ACTIVE</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 border-b border-black/10 pb-1 font-bold text-[#121212] uppercase">
            <span>MODE: {useSimMode ? 'CURSOR_INERTIA' : 'WEBCAM_CENTROID'}</span>
          </div>
        </div>
      </header>

      {/* Active Wizard full screen overlay */}
      {isWizardOpen && (
        <CalibrationWizard
          onCalibrationComplete={handleCalibrationComplete}
          onCancel={() => {
            setIsWizardOpen(false);
            addEvent('INFO', 'Calibration wizard dismissed by user.');
          }}
          gazeVector={gazeState.gazeVector}
          mousePos={mousePos}
          useSimMode={useSimMode}
          numPoints={wizardPoints}
        />
      )}

      {/* Main Orchestrated View Dashboard panel */}
      <MainOverlay
        gazeState={{ ...gazeState, fps: currentFps }}
        config={config}
        setConfig={setConfig}
        events={events}
        addEvent={addEvent}
        triggerCalibration={triggerCalibrationWizard}
        calibrationEngine={calibrationEngine}
        maeError={maeError}
        useSimMode={useSimMode}
        setUseSimMode={setUseSimMode}
        clearLogs={() => setEvents([])}
      />

      {/* Transparent hovering gaze coordinate cursor */}
      <GazeCursor
        x={gazeState.x}
        y={gazeState.y}
        isDwellActive={gazeState.isDwellActive}
        dwellProgress={gazeState.dwellProgress}
        isBlinkActive={gazeState.earCount < 0.1 || gazeState.dwellProgress >= 0.99}
        isTracking={gazeState.isTracking}
      />

      {/* Simulated Eye Gaze controller guide tooltips if cursor goes near settings */}
      {useSimMode && (
        <div className="fixed bottom-6 left-6 bg-white p-4 max-w-[340px] z-30 border border-black shadow-lg pointer-events-auto transition-all">
          <div className="flex gap-2 items-center text-black font-black uppercase text-xs tracking-widest mb-1.5 border-b border-black pb-1">
            <Eye className="w-4 h-4" />
            <span>SI_MODEL ENGAGED</span>
          </div>
          <p className="text-[10px] font-mono leading-relaxed text-slate-600 uppercase">
            Simulate gaze state coordinates via raw mouse positioning on active view. Focus widgets to initiate dwell timers. Press <kbd className="px-1 py-0.5 rounded bg-slate-200 text-black font-bold">Space</kbd> as mock eye blink selection trigger.
          </p>
        </div>
      )}

      {/* Dynamic Cybernetic Footer bar */}
      <footer className="w-full max-w-7xl mx-auto px-6 mt-12 py-6 border-t border-black flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#F5F5F3] relative z-20 font-mono text-[10px] text-slate-500 uppercase">
        <div className="flex items-center gap-1.5 font-bold text-black">
          <span>© {new Date().getFullYear()} GAZEUI CORE</span>
        </div>
        <div className="flex items-center gap-2">
          <span>GITHUB:</span>
          <a
            href="https://github.com/shivamonly"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 bg-white border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] text-black font-extrabold transition-all group"
          >
            <Github className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            <span>PROFILE</span>
          </a>
        </div>
      </footer>

    </main>
  );
}
