import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Eye, 
  Settings, 
  Terminal, 
  Sliders, 
  ShieldCheck, 
  Grid, 
  Activity, 
  MessageSquare, 
  Volume2, 
  Plus, 
  Trash2, 
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Target
} from 'lucide-react';
import { GazeConfig, GazeState, GazeEvent } from '../types';
import { SimulatorFace } from './SimulatorFace';
import { WebcamTracker } from './WebcamTracker';
import { CalibrationEngine } from '../utils/calibration';
import { GazeStabilityChart } from './GazeStabilityChart';
import { BlinkTraining } from './BlinkTraining';

interface MainOverlayProps {
  gazeState: GazeState;
  config: GazeConfig;
  setConfig: React.Dispatch<React.SetStateAction<GazeConfig>>;
  events: GazeEvent[];
  addEvent: (type: GazeEvent['type'], message: string) => void;
  triggerCalibration: (mode: 5 | 9) => void;
  calibrationEngine: CalibrationEngine | null;
  maeError: number | null;
  useSimMode: boolean;
  setUseSimMode: (u: boolean) => void;
  clearLogs: () => void;
}

export const MainOverlay: React.FC<MainOverlayProps> = ({
  gazeState,
  config,
  setConfig,
  events,
  addEvent,
  triggerCalibration,
  calibrationEngine,
  maeError,
  useSimMode,
  setUseSimMode,
  clearLogs,
}) => {
  // AAC Sentences compose state
  const [typedText, setTypedText] = useState('');
  // Track currently hovered item ID if any
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverStartTimeRef = useRef<number | null>(null);

  // Keyboard elements (A list of characters for assistive board)
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'Space', 'Clear ⌫', 'Speak 🔊'];

  // Speech helper
  const speakText = (text: string) => {
    if (!text) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
      addEvent('INFO', `Speech synthesis vocalized: "${text}"`);
    } catch (e) {
      console.warn('Speech synthesis failed', e);
    }
  };

  // Sound feedback on select
  const playClickSound = (freq = 880) => {
    if (!config.ui.audioFeedback) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  };

  // We perform a generic central hit-testing loop inside this dashboard component
  // for elements that are fully visible.
  useEffect(() => {
    const { x, y } = gazeState;
    if (!gazeState.isTracking) return;

    // List of element IDs
    const targets = [
      'btn-tile-1',
      'btn-tile-2',
      'btn-tile-3',
      'btn-tile-4',
      ...letters.map(l => `btn-key-${l}`),
    ];

    let currentHover: string | null = null;

    for (const id of targets) {
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        currentHover = id;
        break;
      }
    }

    if (currentHover !== hoveredId) {
      if (currentHover) {
        // Just entered hover state!
        setHoveredId(currentHover);
        hoverStartTimeRef.current = Date.now();
        playClickSound(440); // Soft enter tick
      } else {
        // Exited hover!
        setHoveredId(null);
        hoverStartTimeRef.current = null;
        // reset dwell progress in global tracker using a window event or state callback
        updateDwellProgress(0, false);
      }
    } else if (currentHover && hoverStartTimeRef.current) {
      // Continuing hover! Compute dwell progress
      const elapsed = Date.now() - hoverStartTimeRef.current;
      const required = config.selection.dwellDurationMs;
      const progress = Math.min(1.0, elapsed / required);

      updateDwellProgress(progress, true);

      if (progress >= 1.0) {
        // Selection triggered!
        handleSelection(currentHover);
        setHoveredId(null);
        hoverStartTimeRef.current = null;
        updateDwellProgress(0, false);
      }
    }
  }, [gazeState.x, gazeState.y, hoveredId, gazeState.isTracking]);

  // Fallback trigger click if user is in blink mode and blinks
  useEffect(() => {
    if (gazeState.earCount < 0.1 && config.selection.mode !== 'dwell' && hoveredId) {
      // Blink selection triggered!
      handleSelection(hoveredId);
      setHoveredId(null);
      hoverStartTimeRef.current = null;
      updateDwellProgress(0, false);
    }
  }, [gazeState.earCount]);

  // Dispatch dwell updates back to applet to animate selection on index cursor
  const updateDwellProgress = (pct: number, active: boolean) => {
    const event = new CustomEvent('gazeui-dwell-update', {
      detail: { progress: pct, isActive: active },
    });
    window.dispatchEvent(event);
  };

  const handleSelection = (id: string) => {
    playClickSound(1200); // Higher pitch finish chime
    
    if (id === 'btn-tile-1') {
      addEvent('DWELL', 'Button A selected. Triggered action channel 1.');
    } else if (id === 'btn-tile-2') {
      addEvent('DWELL', 'Button B selected. Triggered action channel 2.');
    } else if (id === 'btn-tile-3') {
      addEvent('DWELL', 'System integrity check. Status: ALL_METRICS_PASS.');
    } else if (id === 'btn-tile-4') {
      addEvent('DWELL', 'Recalculated homography. Variance 1.1px.');
    } else if (id.startsWith('btn-key-')) {
      const letter = id.replace('btn-key-', '');
      if (letter === 'Space') {
        setTypedText((prev) => prev + ' ');
        addEvent('DWELL', 'Composed letter: SPACE');
      } else if (letter === 'Clear ⌫') {
        setTypedText((prev) => prev.slice(0, -1));
        addEvent('DWELL', 'Composed letter: DELETE_LAST');
      } else if (letter === 'Speak 🔊') {
        speakText(typedText);
      } else {
        setTypedText((prev) => prev + letter);
        addEvent('DWELL', `Composed letter: ${letter}`);
      }
    }
  };

  const getDwellProgressPercent = (id: string) => {
    if (hoveredId === id && hoverStartTimeRef.current) {
      const elapsed = Date.now() - hoverStartTimeRef.current;
      return Math.min(100, Math.round((elapsed / config.selection.dwellDurationMs) * 100));
    }
    return 0;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-7xl mx-auto font-sans relative">
      
      {/* ────────────────── LEFT SIDE: TRACKING METRICS ────────────────── */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        
        {/* Brand Header */}
        <div className="flex flex-col border border-black p-4 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-none bg-black flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-widest text-[#121212] uppercase">
              Gaze<span className="text-black font-extrabold">UI</span>
            </h1>
          </div>
          <p className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mt-2 leading-relaxed">
            Hands-Free Cybernetic Gaze Tracking Control Console.
          </p>
        </div>

        {/* Input Toggle: Virtual Simulator vs Real Webcam */}
        <div className="bg-white p-4 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
          <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
            <span className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
              TRACKER INPUT MATRIX
            </span>
            <span className="text-[9px] font-mono text-slate-400 uppercase">SELECT_SOURCE</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => {
                setUseSimMode(true);
                addEvent('INFO', 'Switched Tracker source to Gaze Vector Simulator Model');
              }}
              className={`py-2 px-3 hover:bg-slate-50 text-[11px] font-mono border uppercase tracking-wider transition-all duration-75 ${
                useSimMode
                  ? 'bg-black text-white font-extrabold border-black'
                  : 'bg-white text-black font-bold border-black/20'
              }`}
            >
              SIMULATION_SRC [CURS]
            </button>
            <button
              onClick={() => {
                setUseSimMode(false);
                addEvent('INFO', 'Switched Tracker source to Web Camera PCCR Centroid algorithm');
              }}
              className={`py-2 px-3 hover:bg-slate-50 text-[11px] font-mono border uppercase tracking-wider transition-all duration-75 ${
                !useSimMode
                  ? 'bg-black text-white font-extrabold border-black'
                  : 'bg-white text-black font-bold border-black/20'
              }`}
            >
              WEBCAM_PCCR [CAMERA]
            </button>
          </div>
        </div>

        {/* Live Vector Feed and Metrics */}
        {useSimMode ? (
          <SimulatorFace
            isTracking={gazeState.isTracking}
            gazeX={gazeState.x}
            gazeY={gazeState.y}
            isBlinkActive={gazeState.earCount < 0.1}
          />
        ) : (
          <WebcamTracker
            onGazeUpdate={(gx, gy, ear) => {
              // Directly bubble update from webcam process
              const event = new CustomEvent('gazeui-coordinate-update', {
                detail: { gx, gy, ear },
              });
              window.dispatchEvent(event);
            }}
            isActive={!useSimMode}
          />
        )}

        {/* Dynamic Accuracy & Polynomial Calibration Metadata */}
        <div className="bg-white p-4 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-black pb-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-black" />
              <span className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
                INTEGRATIVE CALIBRATION
              </span>
            </div>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 border font-bold uppercase transition-all ${
                calibrationEngine
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-[#121212] border-black/30'
              }`}
            >
              {calibrationEngine ? 'ESTIMATED_SYNC' : 'UNINITIALIZED'}
            </span>
          </div>

          {calibrationEngine && maeError !== null ? (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[11px] uppercase tracking-wider font-bold">
                <span className="text-slate-500">Mean Drift Deviation</span>
                <span className="font-mono font-black text-black">
                  {maeError.toFixed(1)} Px
                </span>
              </div>
              <div className="w-full bg-[#E8E8E6] h-2 border border-black overflow-hidden">
                <div
                  className="h-full bg-black transition-all"
                  style={{ width: `${Math.min(100, (120 - maeError) / 1.2)}%` }}
                />
              </div>
              <p className="text-[9px] font-mono text-slate-500 uppercase leading-snug">
                Calibration matrices verified. System projects exact Cartesian pixels mapped to quadratic model boundaries.
              </p>
            </div>
          ) : (
            <p className="text-[10px] font-mono text-slate-500 uppercase leading-relaxed">
              No calibrated coefficients are loaded. Target mapping is currently using simplified viewport direct linear boundaries. Fit a model to establish accurate spatial coordinates.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={() => triggerCalibration(5)}
              className="py-2.5 bg-white hover:bg-slate-50 border border-black text-[10px] font-mono font-black tracking-wider text-black transition-colors"
            >
              5-PT FAST
            </button>
            <button
              onClick={() => triggerCalibration(9)}
              className="py-2.5 bg-white hover:bg-slate-50 border border-black text-[10px] font-mono font-black tracking-wider text-black transition-colors flex items-center justify-center gap-1"
            >
              <Target className="w-3.5 h-3.5 text-black" />
              9-PT FULL
            </button>
          </div>
        </div>

      </div>

      {/* ────────────────── RIGHT SIDE: SCREEN LAYOUT INTERACTIVE ────────────────── */}
      <div className="lg:col-span-8 flex flex-col gap-6">

        {/* Top bar indicators */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-extrabold pb-0.5">GAZE_COORDINATE_X</span>
              <span className="text-sm font-mono font-black text-black leading-tight">
                {Math.round(gazeState.x)} <span className="text-[10px] text-slate-500 font-normal">Px</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-extrabold pb-0.5">GAZE_COORDINATE_Y</span>
              <span className="text-sm font-mono font-black text-black leading-tight">
                {Math.round(gazeState.y)} <span className="text-[10px] text-slate-500 font-normal">Px</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-extrabold pb-0.5">FRAME_BUFFER</span>
              <span className="text-sm font-mono font-bold text-slate-800 leading-tight uppercase">
                {useSimMode ? 'FULL' : '320×240'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#F5F5F3] px-3 py-1.5 border border-black text-xs">
            <Activity className="w-3.5 h-3.5 text-black animate-pulse" />
            <span className="text-[10px] font-mono text-black font-black uppercase tracking-wider">
              TICK_RATE: {gazeState.fps.toFixed(0)} FPS
            </span>
          </div>
        </div>

        {/* INTERACTIVE DEMO SANDBOX AREA: SELECTIONS WORKSPACE */}
        <div className="bg-white p-6 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-6 relative">
          <div className="flex items-center justify-between border-b border-black pb-2.5">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-black" />
              <h2 className="text-xs font-mono font-black tracking-widest text-black uppercase">
                GAZE_ACTIVE_GRID
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">TEST INTERACTIVE APERTURES</span>
          </div>

          {/* Quick Demo Buttons Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { id: 'btn-tile-1', label: 'TILE_ALPHA', color: 'border-black text-black', action: 'CHANNEL_1' },
              { id: 'btn-tile-2', label: 'TILE_BRAVO', color: 'border-black text-black', action: 'CHANNEL_2' },
              { id: 'btn-tile-3', label: 'SECURITY_SYS', color: 'border-black text-black', action: 'INTEGRITY' },
              { id: 'btn-tile-4', label: 'MATRIX_COV', color: 'border-black text-black', action: 'VARIANCE_SYNC' },
            ].map((bt) => {
              const dwellPercent = getDwellProgressPercent(bt.id);
              const isHovering = hoveredId === bt.id;
              return (
                <div
                  key={bt.id}
                  id={bt.id}
                  className={`relative p-5 text-center cursor-crosshair overflow-hidden transition-all uppercase duration-75 ${
                    isHovering 
                      ? 'scale-[1.03] border-2 border-black bg-slate-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' 
                      : 'border border-black/20 bg-white'
                  }`}
                >
                  <p className="text-[10px] font-mono text-black font-extrabold tracking-wider leading-tight mb-1">{bt.label}</p>
                  <p className="text-[9px] font-mono text-slate-400 font-bold tracking-wider">{bt.action}</p>

                  {/* Absolute filling backdrop */}
                  {isHovering && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-black/5 transition-all pointer-events-none"
                      style={{ height: `${dwellPercent}%` }}
                    />
                  )}

                  {/* Hover loading bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200">
                    <div 
                      className="h-full bg-black transition-all duration-75"
                      style={{ width: `${dwellPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ASSISTIVE AAC COMMUNICATION GRID BOARD */}
          <div className="p-4 bg-[#F5F5F3] border border-black flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-black pb-2.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-black" />
                <h3 className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
                  AAC ASSISTIVE CHAT COMPILER [DWELL]
                </h3>
              </div>
              <span className="text-[9px] font-mono text-[#121212] font-black uppercase">SYSTEM_INTEROP</span>
            </div>

            {/* Simulated compose output */}
            <div className="relative p-4 bg-white border border-black text-[#121212] min-h-[48px] flex items-center justify-between gap-4 font-mono text-xs uppercase shadow-inner">
              <p className={typedText ? 'text-black font-bold tracking-wider' : 'text-slate-400'}>
                {typedText || 'COMPOSE BY HOVERING OVER THE LETTERS BELOW...'}
              </p>
              {typedText && (
                <button
                  onClick={() => setTypedText('')}
                  className="py-1 px-3 bg-black border border-black text-white hover:bg-slate-800 font-mono font-bold text-[10px] tracking-wider uppercase leading-none"
                >
                  CLEAR
                </button>
              )}
            </div>

            {/* Horizontal letter keys grid */}
            <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
              {letters.map((char) => {
                const kid = `btn-key-${char}`;
                const dwellPercent = getDwellProgressPercent(kid);
                const isHovering = hoveredId === kid;
                return (
                  <button
                    key={char}
                    id={kid}
                    tabIndex={-1}
                    className={`relative py-3.5 text-xs font-mono transition-all overflow-hidden uppercase ${
                      isHovering
                        ? 'bg-black text-white border-black font-black scale-105 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-white text-black border-black/20 hover:border-black font-bold hover:text-black hover:bg-slate-50'
                    } border`}
                  >
                    <span>{char}</span>

                    {/* Dwell fill progress mask */}
                    {isHovering && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-[#121212]/15 transition-all pointer-events-none"
                        style={{ height: `${dwellPercent}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* CRITICAL SETTINGS / CONFIG CONTROLLER SLIDERS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-black pb-2">
              <Sliders className="w-4 h-4 text-black" />
              <h3 className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
                SYSTEM SELECTION ENGINE
              </h3>
            </div>

            {/* Dwell slider config */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider font-bold">
                <span className="text-slate-500">Hold Selection Dwell Duration</span>
                <span className="text-black font-black">
                  {config.selection.dwellDurationMs} Ms
                </span>
              </div>
              <input
                type="range"
                min="800"
                max="3000"
                step="100"
                value={config.selection.dwellDurationMs}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    selection: { ...prev.selection, dwellDurationMs: val },
                  }));
                  addEvent('INFO', `Dwell filter set duration: ${val}ms`);
                }}
                className="w-full h-1.5 bg-[#E8E8E6] rounded-none appearance-none cursor-pointer accent-black"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                <span>800ms [FAST]</span>
                <span>1500ms [DEFAULT]</span>
                <span>3000ms [STABLE]</span>
              </div>
            </div>

            {/* Interaction mode picker */}
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">Target Selector Mode</p>
              <div className="grid grid-cols-3 gap-2 bg-[#F5F5F3] p-1 border border-black">
                {(['dwell', 'blink', 'both'] as const).map((md) => (
                  <button
                    key={md}
                    onClick={() => {
                       setConfig((prev) => ({
                        ...prev,
                        selection: { ...prev.selection, mode: md },
                      }));
                      addEvent('INFO', `Changed selection Mode: ${md.toUpperCase()}`);
                    }}
                    className={`py-1.5 text-[10px] font-mono uppercase transition-all duration-75 ${
                      config.selection.mode === md
                        ? 'bg-black text-white font-extrabold'
                        : 'text-slate-500 hover:text-black font-bold'
                    }`}
                  >
                    {md}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-black pb-2">
              <Sliders className="w-4 h-4 text-black" />
              <h3 className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
                SIGNAL FILTER PARAMETERS
              </h3>
            </div>

            {/* Smoothing config */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider font-bold">
                <span className="text-slate-500">EMA Filter Smoothing Alpha (α)</span>
                <span className="text-black font-black">
                  {config.tracking.smoothingAlpha.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={config.tracking.smoothingAlpha}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    tracking: { ...prev.tracking, smoothingAlpha: val },
                  }));
                  addEvent('INFO', `EMA smooth parameter adjusted: α = ${val}`);
                }}
                className="w-full h-1.5 bg-[#E8E8E6] rounded-none appearance-none cursor-pointer accent-black"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                <span>0.1 [STABLE]</span>
                <span>0.9 [RAW_JITTER]</span>
              </div>
            </div>

            {/* Gaze Sensitivity multiplier for uncalibrated fallback tracking */}
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider font-bold">
                <span className="text-slate-500">Auto-Detect Cursor Sensitivity</span>
                <span className="text-black font-black bg-black text-white px-1.5 py-0.5 text-[9px]">
                  {(config.tracking.sensitivity ?? 4.5).toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="10.0"
                step="0.5"
                value={config.tracking.sensitivity ?? 4.5}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    tracking: { ...prev.tracking, sensitivity: val },
                  }));
                  addEvent('INFO', `Primary Gaze Cursor Sensitivity adjusted: ${val}x`);
                }}
                className="w-full h-1.5 bg-[#E8E8E6] rounded-none appearance-none cursor-pointer accent-black"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                <span>1.0x [LOW]</span>
                <span>10.0x [EXTREME]</span>
              </div>
            </div>

            {/* Signal indicators */}
            <div className="grid grid-cols-2 gap-3 mt-1.5 text-[10px] font-mono uppercase leading-normal">
              <div className="flex flex-col bg-[#F5F5F3] p-2.5 border border-black">
                <span className="text-slate-500 font-bold uppercase tracking-wider">KALMAN STATS</span>
                <span className="text-black font-black mt-1">ACTIVE</span>
              </div>
              <div className="flex flex-col bg-[#F5F5F3] p-2.5 border border-black">
                <span className="text-slate-500 font-bold uppercase tracking-wider">SOUND CHIME</span>
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className={config.ui.audioFeedback ? 'text-black font-black' : 'text-slate-400 font-bold'}>
                    {config.ui.audioFeedback ? 'SOUNDS: ON' : 'MUTED'}
                  </span>
                  <button
                    onClick={() => {
                      setConfig((prev) => ({
                        ...prev,
                        ui: { ...prev.ui, audioFeedback: !prev.ui.audioFeedback },
                      }));
                    }}
                    className="text-black font-extrabold uppercase font-mono text-[9px] tracking-wider underline hover:no-underline"
                  >
                    TOGGLE
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Real-time Gaze Stability Chart */}
        <GazeStabilityChart gazeState={gazeState} />

        {/* Interactive Blink Training Station */}
        <BlinkTraining
          gazeState={gazeState}
          config={config}
          setConfig={setConfig}
          addEvent={addEvent}
        />

        {/* LOG CONSOLE / EVENT TIMELINE READOUT PANEL */}
        <div className="bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden max-h-[220px]">
          <div className="flex items-center justify-between border-b border-black p-3.5 bg-white">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-black" />
              <h3 className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
                GAZEUI_DEVIATION_STREAM
              </h3>
            </div>
            <button
              onClick={clearLogs}
              className="py-1 px-3 hover:bg-slate-50 text-[10px] font-mono uppercase border border-black text-black font-bold active:scale-95 transition-colors"
            >
              CLEAR_STREAM
            </button>
          </div>

          <div className="p-3.5 overflow-y-auto flex flex-col gap-1.5 font-mono text-[11px] leading-relaxed text-[#121212] min-h-[140px] bg-[#F5F5F3]">
            {events.length === 0 ? (
              <p className="text-slate-400 italic font-bold uppercase">No telemetry messages generated. Stabilize gaze to test widgets.</p>
            ) : (
              events.map((ev, idx) => {
                let color = 'text-[#121212]';
                if (ev.type === 'DWELL') color = 'text-black font-black';
                if (ev.type === 'SINGLE_BLINK') color = 'text-black italic font-bold';
                if (ev.type === 'CALIBRATION_POINT') color = 'text-black tracking-wide font-black';

                return (
                  <motion.div
                    key={ev.id || idx}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                    className="flex gap-2.5 shrink-0 hover:bg-black/5 p-0.5 rounded transition-all"
                  >
                    <span className="text-slate-500 shrink-0">[{ev.timestamp}]</span>
                    <span className="shrink-0 font-extrabold uppercase text-black">
                      [{ev.type}]
                    </span>
                    <p className={`${color} leading-none uppercase`}>{ev.message}</p>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
