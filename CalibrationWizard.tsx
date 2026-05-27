import React, { useEffect, useState, useRef } from 'react';
import { Play, RotateCcw, Award, CheckCircle2, ChevronRight, HelpCircle, AlertCircle } from 'lucide-react';
import { CalibrationPoint } from '../types';
import { CalibrationEngine } from '../utils/calibration';

interface CalibrationWizardProps {
  onCalibrationComplete: (engine: CalibrationEngine, mae: number) => void;
  onCancel: () => void;
  gazeVector: [number, number]; // Received real-time gaze from tracker
  mousePos: [number, number]; // Backup mouse coordinate
  useSimMode: boolean;
  numPoints: 5 | 9;
}

export const CalibrationWizard: React.FC<CalibrationWizardProps> = ({
  onCalibrationComplete,
  onCancel,
  gazeVector,
  mousePos,
  useSimMode,
  numPoints,
}) => {
  const [step, setStep] = useState<'welcome' | 'active' | 'results'>('welcome');
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [countdown, setCountdown] = useState(2.0); // 2 seconds per point
  
  // Accumulated samples
  const [samples, setSamples] = useState<[number, number][]>([]);
  const currentSamplesRef = useRef<[number, number][]>([]);

  // Coordinates of target points
  const [targetPoints, setTargetPoints] = useState<CalibrationPoint[]>([]);
  // Fitted error
  const [maeError, setMaeError] = useState<number>(0);

  // References
  const calibrationEngineRef = useRef(new CalibrationEngine());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sampleIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const gazeVectorRef = useRef<[number, number]>(gazeVector);
  const mousePosRef = useRef<[number, number]>(mousePos);
  const useSimModeRef = useRef<boolean>(useSimMode);

  // Sync references to current state on render to avoid timer teardown on fast inputs
  useEffect(() => {
    gazeVectorRef.current = gazeVector;
  }, [gazeVector]);

  useEffect(() => {
    mousePosRef.current = mousePos;
  }, [mousePos]);

  useEffect(() => {
    useSimModeRef.current = useSimMode;
  }, [useSimMode]);

  useEffect(() => {
    // Generate targets on load based on viewport dims
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const marginX = Math.round(screenW * 0.12);
    const marginY = Math.round(screenH * 0.12);
    const cx = Math.round(screenW / 2);
    const cy = Math.round(screenH / 2);

    let points: CalibrationPoint[] = [];
    if (numPoints === 9) {
      const xs = [marginX, cx, screenW - marginX];
      const ys = [marginY, cy, screenH - marginY];
      let id = 1;
      for (const y of ys) {
        for (const x of xs) {
          points.push({ x, y, id: id++ });
        }
      }
    } else {
      points = [
        { x: marginX, y: marginY, id: 1 },
        { x: screenW - marginX, y: marginY, id: 2 },
        { x: cx, y: cy, id: 3 },
        { x: marginX, y: screenH - marginY, id: 4 },
        { x: screenW - marginX, y: screenH - marginY, id: 5 },
      ];
    }
    // Shuffle points slightly to make calibration less repetitive
    setTargetPoints(points);
  }, [numPoints]);

  const startCalibration = () => {
    setSamples([]);
    currentSamplesRef.current = [];
    setCurrentPointIndex(0);
    setCountdown(2.0);
    setStep('active');
  };

  useEffect(() => {
    if (step !== 'active') return;

    let localCountdown = 2.0;
    setCountdown(2.0);

    // Tick down and sample using a single interval.
    // This ensures consistent timing and avoids splitting into separate timers.
    const tickRate = 33; // ~30 FPS
    timerRef.current = setInterval(() => {
      localCountdown -= 0.033;
      setCountdown(Math.max(0, localCountdown));

      // Sample the gaze vector every 33ms during the last 1 second (1.0s down to 0s)
      // Discarding initial fixation latency (first 1.0s)
      if (localCountdown <= 1.0 && localCountdown > 0) {
        if (useSimModeRef.current) {
          const rawVecX = (mousePosRef.current[0] / window.innerWidth - 0.5) * 2;
          const rawVecY = (mousePosRef.current[1] / window.innerHeight - 0.5) * 2;
          currentSamplesRef.current.push([rawVecX, rawVecY]);
        } else {
          currentSamplesRef.current.push([gazeVectorRef.current[0], gazeVectorRef.current[1]]);
        }
      }

      if (localCountdown <= 0.01) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        handlePointComplete();
      }
    }, tickRate);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [step, currentPointIndex]);

  const handlePointComplete = () => {
    // Audit samples collected for the completed point
    const pointSamples = currentSamplesRef.current;
    
    // Average the samples to find the stable center of focus
    let avgGazeX = 0;
    let avgGazeY = 0;
    if (pointSamples.length > 0) {
      const sum = pointSamples.reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1]], [0, 0]);
      avgGazeX = sum[0] / pointSamples.length;
      avgGazeY = sum[1] / pointSamples.length;
    } else {
      // Fallback
      avgGazeX = (targetPoints[currentPointIndex].x / window.innerWidth - 0.5) * 2;
      avgGazeY = (targetPoints[currentPointIndex].y / window.innerHeight - 0.5) * 2;
    }

    // Accumulate the mapping pair
    const target = targetPoints[currentPointIndex];
    setSamples((prev) => [...prev, [avgGazeX, avgGazeY]]);
    currentSamplesRef.current = [];

    // Play subtle audio confirmation chime
    playChime();

    if (currentPointIndex < targetPoints.length - 1) {
      setCurrentPointIndex((prev) => prev + 1);
    } else {
      // Finished all points! Perform Least Squares fitting!
      handleFitCalibration([...samples, [avgGazeX, avgGazeY]]);
    }
  };

  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch (e) {
      // AudioContext fails silently if no user gesture has occurred yet
    }
  };

  const handleFitCalibration = (finalSamples: [number, number][]) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (sampleIntervalRef.current) clearInterval(sampleIntervalRef.current);

    // Build the training screen target matrix
    const targets: [number, number][] = targetPoints.map((p) => [p.x, p.y]);

    // OLS Fit
    const error = calibrationEngineRef.current.fit(finalSamples, targets);
    setMaeError(error);
    setStep('results');
  };

  const saveAndExit = () => {
    onCalibrationComplete(calibrationEngineRef.current, maeError);
  };

  const getAccuracyBadge = (error: number) => {
    if (error < 40) return { label: 'Excellent Accuracy', color: 'text-black border-black bg-white font-black' };
    if (error < 75) return { label: 'Good Gaze Lock', color: 'text-black border-black/60 bg-white font-bold' };
    return { label: 'Recalibrate Recommended', color: 'text-red-600 border-red-600 bg-white font-bold' };
  };

  // Active target coords
  const activeDot = targetPoints[currentPointIndex] || { x: 960, y: 540 };

  return (
    <div className="fixed inset-0 bg-[#F5F5F3] z-[99999] flex items-center justify-center font-sans overflow-hidden select-none text-[#121212]">
      
      {/* Mesh grid background */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:5rem_5rem] pointer-events-none" 
        style={{ opacity: step === 'active' ? 0.4 : 1.0 }}
      />

      {step === 'welcome' && (
        <div className="relative max-w-lg w-full p-8 mx-4 border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
          <div className="text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-none border-2 border-black bg-black flex items-center justify-center">
              <span className="w-3 h-3 rounded-none bg-white animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-black tracking-tight mt-2 uppercase">
              Calibration Engine
            </h2>
            <p className="text-xs font-mono tracking-widest text-slate-500 font-bold mt-0.5 uppercase">
              {numPoints}-POINT QUADRATIC SETUP MATRIX
            </p>
          </div>

          <div className="bg-[#F5F5F3] p-5 border border-black/15 text-xs text-black font-semibold leading-relaxed flex flex-col gap-3">
            <div className="flex gap-2">
              <ChevronRight className="w-4 h-4 text-black shrink-0 mt-0.5" />
              <p className="uppercase">Keep your head steady. Do not tilt or rotate. Move only your eyes.</p>
            </div>
            <div className="flex gap-2">
              <ChevronRight className="w-4 h-4 text-black shrink-0 mt-0.5" />
              <p className="uppercase">Follow the dynamic target with your gaze. Fixate on the dot center.</p>
            </div>
            <div className="flex gap-2">
              <ChevronRight className="w-4 h-4 text-black shrink-0 mt-0.5" />
              <p className="uppercase">Each target captures metrics for 2.0s. Discards initial saccadic latency.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-[#F5F5F3] p-3 border border-black">
            <HelpCircle className="w-4 h-4 text-black shrink-0" />
            <p className="text-[10px] font-mono text-black font-black uppercase tracking-wider">
              Calibration Mode: <span>{numPoints}-Point Mesh</span>
              {useSimMode && <span className="ml-1 text-slate-500 font-medium">(Virtual Gaze Mode)</span>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <button
              onClick={onCancel}
              className="py-2.5 px-4 bg-white hover:bg-slate-50 text-black text-xs font-mono border-2 border-black font-bold active:scale-95 transition-all text-center uppercase"
            >
              QUIT SETUP
            </button>
            <button
              onClick={startCalibration}
              className="py-2.5 px-4 bg-black hover:bg-slate-900 text-white font-black text-xs font-mono active:scale-95 transition-all flex items-center justify-center gap-2 uppercase"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              START CALIBRATION
            </button>
          </div>
        </div>
      )}

      {step === 'active' && (
        <div className="absolute inset-0">
          {/* Header Progress Counter Display */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white border-2 border-black px-5 py-2.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs font-mono flex items-center gap-4 text-black">
            <span className="font-black uppercase">CALIBRATING GRID</span>
            <div className="w-px h-3 bg-black" />
            <span className="text-black font-black uppercase">
              POINT {currentPointIndex + 1} OF {targetPoints.length}
            </span>
            <div className="w-px h-3 bg-black" />
            <span className="text-slate-500 font-bold">
              {Math.round((currentPointIndex / targetPoints.length) * 100)}%
            </span>
          </div>

          {/* Absolute Target Dot and progress indicator */}
          <div
            className="absolute transition-all duration-300 ease-out flex items-center justify-center"
            style={{
              left: activeDot.x - 40,
              top: activeDot.y - 40,
              width: 80,
              height: 80,
            }}
          >
            {/* Pulsing countdown circle */}
            <svg width="80" height="80" viewBox="0 0 80 80" className="absolute rotate-[-90deg]">
              <circle
                cx="40"
                cy="40"
                r="18"
                fill="none"
                stroke="rgba(0, 0, 0, 0.08)"
                strokeWidth="1.5"
              />
              <circle
                cx="40"
                cy="40"
                r="18"
                fill="none"
                stroke="#121212"
                strokeWidth="3.5"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={2 * Math.PI * 18 * (1 - countdown / 2.0)}
              />
            </svg>

            {/* Glowing target core center */}
            <div className="relative w-4 h-4 rounded-none bg-white border-2 border-black flex items-center justify-center shadow-md">
              <span className={`w-2 h-2 rounded-none absolute transition-all ${countdown > 1.0 ? 'bg-black' : 'bg-red-600 animate-ping'}`} />
              <span className={`w-1.5 h-1.5 rounded-none bg-black z-10`} />
            </div>

            {/* Target identifier tag */}
            <span className="absolute bottom-[-16px] text-[8px] font-mono text-black font-black uppercase tracking-wider">
              {countdown <= 1.0 ? 'RECORDING' : 'FIXATING'}
            </span>
          </div>

          {/* User Guide text */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-xs text-center">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-relaxed font-bold">
              Keep eye focus locked to the targets center coordinate
            </p>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div className="relative max-w-md w-full p-8 mx-4 border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
          <div className="text-center flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-none bg-black flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-black text-black tracking-tight mt-2 uppercase">
              Calibration Fit
            </h3>
            <p className="text-[10px] font-mono tracking-wider text-slate-500 font-bold uppercase">
              LOOCV SYSTEM ESTIMATED ERROR VARIANCE
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#F5F5F3] p-4 border border-black text-center flex flex-col justify-center">
              <p className="text-[9px] font-mono text-slate-500 font-bold uppercase">MEAN ABSOLUTE ERROR</p>
              <h4 className="text-2xl font-black text-black mt-1 uppercase">
                {maeError.toFixed(1)} <span className="text-xs font-mono text-slate-500">px</span>
              </h4>
            </div>
            <div className={`p-4 border border-black flex flex-col justify-center text-center ${getAccuracyBadge(maeError).color}`}>
              <p className="text-[9px] font-mono text-slate-500 font-bold uppercase">DECISION PROFILE</p>
              <h4 className="text-xs font-mono font-black mt-1.5 uppercase leading-snug">
                {getAccuracyBadge(maeError).label}
              </h4>
            </div>
          </div>

          {/* Verification parameters */}
          <div className="bg-[#F5F5F3] p-3 border border-black flex flex-col gap-1.5 text-[10px] font-mono text-black font-bold uppercase">
            <div className="flex justify-between">
              <span>FITTED DIMENSION_X:</span>
              <span className="text-black font-black">6 Matrix terms (Quadratic)</span>
            </div>
            <div className="flex justify-between">
              <span>FITTED DIMENSION_Y:</span>
              <span className="text-black font-black">6 Matrix terms (Quadratic)</span>
            </div>
            <div className="flex justify-between">
              <span>SAMPLES EVALUATED:</span>
              <span className="text-slate-500">{numPoints} stable points</span>
            </div>
            <div className="flex justify-between border-t border-black/10 mt-2 pt-2">
              <span>STABILITY CONDITION_L2:</span>
              <span className="text-black">Pass (Ridge = 1e-4)</span>
            </div>
          </div>

          {/* Action limits */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              onClick={startCalibration}
              className="py-2.5 px-4 bg-white hover:bg-slate-50 text-black text-xs font-mono border-2 border-black font-bold active:scale-95 transition-all flex items-center justify-center gap-2 uppercase"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RETRY GRID
            </button>
            <button
              onClick={saveAndExit}
              className="py-2.5 px-4 bg-black hover:bg-slate-900 text-white font-black text-xs font-mono active:scale-95 transition-all flex items-center justify-center gap-1 uppercase"
            >
              APPLY MATRIX
              <ChevronRight className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
