import React, { useState, useEffect, useRef } from 'react';
import { Target, Play, Square, Award, Sliders, Activity, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { GazeState, GazeConfig } from '../types';

interface BlinkTrainingProps {
  gazeState: GazeState;
  config: GazeConfig;
  setConfig: React.Dispatch<React.SetStateAction<GazeConfig>>;
  addEvent: (type: string, message: string) => void;
}

interface TargetStation {
  id: number;
  label: string;
  top: string; // percentage
  left: string; // percentage
}

const STATIONS: TargetStation[] = [
  { id: 1, label: 'CENTER STATION', top: '50%', left: '50%' },
  { id: 2, label: 'TOP LEFT SHORE', top: '25%', left: '25%' },
  { id: 3, label: 'TOP RIGHT CORNER', top: '25%', left: '75%' },
  { id: 4, label: 'BOTTOM LEFT ANCHOR', top: '75%', left: '25%' },
  { id: 5, label: 'BOTTOM RIGHT SECTOR', top: '75%', left: '75%' },
];

export const BlinkTraining: React.FC<BlinkTrainingProps> = ({
  gazeState,
  config,
  setConfig,
  addEvent,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [targetState, setTargetState] = useState<'countdown' | 'ready' | 'success' | 'missed'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [blinkThreshold, setBlinkThreshold] = useState(130);
  
  // High-performance state tracking
  const stateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevBlinkRef = useRef(false);

  // Synchronize webcam calibration threshold
  useEffect(() => {
    const handleThresholdChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.threshold === 'number') {
        setBlinkThreshold(customEvent.detail.threshold);
      }
    };
    window.addEventListener('gazeui-blink-threshold-changed', handleThresholdChange);
    return () => {
      window.removeEventListener('gazeui-blink-threshold-changed', handleThresholdChange);
    };
  }, []);

  const updateThreshold = (val: number) => {
    setBlinkThreshold(val);
    const event = new CustomEvent('gazeui-set-blink-threshold', {
      detail: { threshold: val },
    });
    window.dispatchEvent(event);
  };

  // Self-contained high precision feedback synth chimes
  const playFreq = (freq: number, type: 'sine' | 'triangle' | 'sawtooth' = 'sine', duration = 0.15) => {
    if (!config.ui.audioFeedback) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (err) {
      // Audio context fallbacks
    }
  };

  // Safe tracking of blink leading edges (transition state)
  const isBlinkingNow = gazeState.earCount < 0.1;
  useEffect(() => {
    if (isBlinkingNow && !prevBlinkRef.current) {
      // Blink triggered! Let's check status
      if (isRunning && targetState === 'ready') {
        // Successful selection!
        clearTimers();
        setTargetState('success');
        setScore((s) => s + 1);
        setAttempts((a) => a + 1);
        playFreq(880, 'sine', 0.25);
        addEvent('SINGLE_BLINK', `Calibration Training: Hit target ${activeStep + 1}!`);
        
        // Prepare to go to next station after elegant delay
        stateTimerRef.current = setTimeout(() => {
          advanceToNext();
        }, 1500);
      } else if (isRunning && targetState === 'countdown') {
        playFreq(220, 'triangle', 0.15);
        addEvent('WARNING', 'Calibration Training: Too early, wait for target to turn green!');
      }
    }
    prevBlinkRef.current = isBlinkingNow;
  }, [isBlinkingNow, isRunning, targetState, activeStep]);

  const clearTimers = () => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, []);

  const startTraining = () => {
    clearTimers();
    setIsRunning(true);
    setActiveStep(0);
    setScore(0);
    setAttempts(0);
    playFreq(440, 'sine', 0.2);
    addEvent('INFO', 'Blink selection Calibration training commenced.');
    initiateStation(0);
  };

  const stopTraining = () => {
    clearTimers();
    setIsRunning(false);
    playFreq(300, 'sine', 0.2);
    addEvent('INFO', 'Blink selection Calibration training paused.');
  };

  const initiateStation = (idx: number) => {
    clearTimers();
    setTargetState('countdown');
    setCountdown(3);

    // Track a 3-step countdown
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current!);
          triggerReadyState();
          return 0;
        }
        playFreq(600, 'sine', 0.06);
        return prev - 1;
      });
    }, 850);
  };

  const triggerReadyState = () => {
    setTargetState('ready');
    playFreq(1200, 'sine', 0.15); // Trigger high frequency tone
    
    // Set timing limit for the ready state (1.8 seconds feedback window)
    stateTimerRef.current = setTimeout(() => {
      setTargetState('missed');
      setAttempts((a) => a + 1);
      playFreq(150, 'sawtooth', 0.25);
      addEvent('WARNING', `Calibration Training: Target ${activeStep + 1} missed.`);
      
      // Move on to next step
      stateTimerRef.current = setTimeout(() => {
        advanceToNext();
      }, 1500);
    }, 1800);
  };

  const advanceToNext = () => {
    if (activeStep < STATIONS.length - 1) {
      const nextIdx = activeStep + 1;
      setActiveStep(nextIdx);
      initiateStation(nextIdx);
    } else {
      // Training fully complete!
      setIsRunning(false);
      playFreq(1500, 'sine', 0.6);
      addEvent('INFO', `Blink sequence completed! Score: ${score}/${STATIONS.length}`);
    }
  };

  const activeStation = STATIONS[activeStep];

  return (
    <div className="bg-white p-6 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4.5 h-4.5 text-black" />
          <h3 className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
            Interactive Blink Training Station
          </h3>
        </div>
        <span className="text-[9px] font-mono font-black uppercase text-slate-500 bg-slate-200 px-2 py-0.5">
          STATION_GRID
        </span>
      </div>

      <p className="text-[10px] font-mono text-slate-500 uppercase leading-relaxed">
        Ideal for fine-tuning the webcam’s pupil-blink threshold. Focus on each circular target. Once countdown ends and target turns <span className="text-emerald-600 font-extrabold font-mono">NEON GREEN</span>, blink deliberately to trigger selection!
      </p>

      {/* Target Stage Canvas */}
      <div className="relative w-full h-[220px] bg-[#F5F5F3] border border-black overflow-hidden flex items-center justify-center">
        
        {/* Subtle crosshairs background decoration */}
        <div className="absolute inset-0 border border-dashed border-black/5 pointer-events-none" />
        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-black/5 pointer-events-none" />
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black/5 pointer-events-none" />

        {isRunning ? (
          <div 
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none transition-all duration-300"
            style={{ top: activeStation.top, left: activeStation.left }}
          >
            {/* The Target Ring */}
            <div 
              className={`w-14 h-14 rounded-full flex items-center justify-center border-2 shadow-md transition-all duration-150 relative ${
                targetState === 'countdown' ? 'bg-amber-100 border-amber-600 animate-pulse text-amber-900' :
                targetState === 'ready' ? 'bg-emerald-500 border-black ring-4 ring-emerald-300 text-white font-extrabold animate-bounce' :
                targetState === 'success' ? 'bg-black border-black text-white' :
                'bg-red-500 border-black text-white'
              }`}
            >
              {targetState === 'countdown' && (
                <span className="text-xs font-mono font-black">{countdown}</span>
              )}
              {targetState === 'ready' && (
                <Zap className="w-5 h-5 animate-pulse text-white" />
              )}
              {targetState === 'success' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
              {targetState === 'missed' && (
                <AlertCircle className="w-5 h-5 text-white" />
              )}
              
              {/* Outer target scope circles */}
              <div className="absolute -inset-2.5 rounded-full border border-black/10 pointer-events-none" />
              <div className="absolute -inset-5 rounded-full border border-dashed border-black/5 pointer-events-none" />
            </div>

            {/* Label below */}
            <span className="text-[8px] font-mono font-black tracking-wider uppercase mt-1.5 bg-black text-white px-1 py-0.5 py-px">
              {targetState === 'countdown' ? 'FOCUSING' : 
               targetState === 'ready' ? '!!! BLINK !!!' : 
               targetState === 'success' ? 'MATCHED' : 'TIMEOUT'}
            </span>
            <span className="text-[7.5px] font-mono text-slate-400 mt-0.5 font-bold uppercase shrink-0">
              {activeStation.label}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-200 border border-black flex items-center justify-center">
              <Target className="w-6 h-6 text-slate-500" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-black font-extrabold uppercase">CALIBRATOR CONSOLE IDLE</span>
              <p className="text-[9px] font-mono text-slate-400 uppercase leading-normal">
                Press Begin Training to test your blink selection tracking reliability over successive visual stations.
              </p>
            </div>
            <button
              onClick={startTraining}
              className="py-1.5 px-6 bg-black text-white border border-black text-[10px] font-mono font-black tracking-widest uppercase hover:bg-slate-800 transition-all active:scale-95 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none translate-x-0 translate-y-0"
            >
              🚀 BEGIN TRAINING
            </button>
          </div>
        )}

        {/* Floating live scores metrics */}
        {isRunning && (
          <div className="absolute top-3.5 left-3.5 bg-white border border-black px-2 py-1.5 font-mono text-[9px] font-bold flex gap-4 uppercase select-none">
            <div>STATION: <span className="font-extrabold">{activeStep + 1} / 5</span></div>
            <div>STRIKE RATE: <span className="font-extrabold text-emerald-600">{score} / {attempts}</span></div>
          </div>
        )}
      </div>

      {/* Threshold and Eye Signal Analysis Console */}
      <div className="bg-[#F5F5F3] p-4 border border-black/15 flex flex-col sm:flex-row items-center justify-between gap-5">
        
        {/* Pupil Blink Threshold Calibration Slider */}
        <div className="w-full sm:w-1/2 flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider font-bold">
            <span className="text-slate-500">Practice Blink Threshold</span>
            <span className="text-black font-black bg-black text-white px-1.5 py-0.5">
              {blinkThreshold}
            </span>
          </div>
          <input
            type="range"
            min="60"
            max="230"
            step="5"
            value={blinkThreshold}
            onChange={(e) => updateThreshold(parseInt(e.target.value))}
            className="w-full h-1.5 bg-[#E8E8E6] rounded-none appearance-none cursor-pointer accent-black"
          />
          <div className="flex justify-between text-[8px] font-mono text-slate-400 uppercase">
            <span>60 [LIGHT BLINK]</span>
            <span>130 [DEFAULT]</span>
            <span>230 [TIGHT CLAMP]</span>
          </div>
        </div>

        {/* Live indicator check */}
        <div className="w-full sm:w-1/2 flex flex-col gap-2.5">
          <div className="flex justify-between items-center text-[9px] font-mono uppercase text-slate-500 font-bold">
            <span>LIVE BLINK DETECTOR SENSOR STATE</span>
            <span className={isBlinkingNow ? 'text-emerald-600 font-extrabold animate-pulse' : 'text-slate-400'}>
              {isBlinkingNow ? 'CLOSED' : 'OPEN'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Horizontal state track */}
            <div className="flex-1 bg-slate-200 h-3 border border-black relative overflow-hidden">
              <div 
                className={`h-full transition-all duration-75 ${
                  isBlinkingNow ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
                style={{ width: isBlinkingNow ? '100%' : '15%' }}
              />
              {/* Threshold indicator notch line */}
              <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 left-[50%] pointer-events-none" />
            </div>
            
            {isRunning && (
              <button
                onClick={stopTraining}
                className="py-1 px-3 bg-red-600 text-white hover:bg-red-700 font-mono text-[9px] font-black uppercase tracking-wider border border-black shrink-0 transition-colors"
              >
                ABORT
              </button>
            )}
          </div>
          
          <p className="text-[8.5px] font-mono text-slate-400 uppercase leading-normal">
            {gazeState.earCount < 0.1 ? (
              <span className="text-emerald-600 font-bold">▶ Blink Registered. Current selection model registers action.</span>
            ) : (
              <span>▶ Standard open state. Close eyes for &gt;150ms to fire threshold triggers.</span>
            )}
          </p>
        </div>

      </div>

      {/* Target Selector Mode Checkbox Toggle shortcut */}
      <div className="flex items-center justify-between uppercase font-mono text-[10px] text-[#121212] border-t border-black/10 pt-2 pb-1">
        <span className="text-slate-500 font-bold">Recommended Mode:</span>
        <button
          onClick={() => {
            setConfig((prev) => ({
              ...prev,
              selection: { ...prev.selection, mode: 'blink' },
            }));
            addEvent('INFO', 'Target Select Mode updated to: BLINK');
          }}
          className={`px-3 py-1 text-[9px] border font-black tracking-wider transition-all ${
            config.selection.mode === 'blink'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-black border-black hover:bg-[#F5F5F3]'
          }`}
        >
          {config.selection.mode === 'blink' ? '✓ ENROLLED IN BLINK SELECTION' : '⚡ ENABLE BLINK MODE'}
        </button>
      </div>

    </div>
  );
};
