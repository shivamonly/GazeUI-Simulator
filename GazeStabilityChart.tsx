import React, { useEffect, useState, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { GazeState } from '../types';
import { Activity, Settings2 } from 'lucide-react';

interface GazeStabilityChartProps {
  gazeState: GazeState;
}

export const GazeStabilityChart: React.FC<GazeStabilityChartProps> = ({ gazeState }) => {
  const [data, setData] = useState<{
    timeId: number;
    rawX: number;
    filteredX: number;
    rawY: number;
    filteredY: number;
  }[]>([]);

  // Toggles for visual clarity
  const [showX, setShowX] = useState(true);
  const [showY, setShowY] = useState(true);
  const [showRaw, setShowRaw] = useState(true);

  // Maintain latest coordinates in ref to avoid re-running interval
  const latestGazeRef = useRef(gazeState);
  useEffect(() => {
    latestGazeRef.current = gazeState;
  }, [gazeState]);

  // Record history at 150ms intervals.
  // 30 seconds / 150ms = 200 data points.
  useEffect(() => {
    let tickCount = 0;
    const intervalId = setInterval(() => {
      setData((prev) => {
        const { x, y, rawX, rawY } = latestGazeRef.current;

        // Convert coordinates to screen-based percentages [0, 100] so they share the same axis
        const width = window.innerWidth || 1200;
        const height = window.innerHeight || 800;

        const pFilteredX = (x / width) * 100;
        const pRawX = (rawX / width) * 100;
        const pFilteredY = (y / height) * 100;
        const pRawY = (rawY / height) * 100;

        const newDatum = {
          timeId: tickCount++,
          filteredX: Number(Math.max(0, Math.min(100, pFilteredX)).toFixed(1)),
          rawX: Number(Math.max(0, Math.min(100, pRawX)).toFixed(1)),
          filteredY: Number(Math.max(0, Math.min(100, pFilteredY)).toFixed(1)),
          rawY: Number(Math.max(0, Math.min(100, pRawY)).toFixed(1)),
        };

        const maxSamples = 200; // ~30 seconds duration
        return [...prev, newDatum].slice(-maxSamples);
      });
    }, 150);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="bg-white p-6 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
      
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-black animate-pulse" />
          <h3 className="text-xs font-mono font-black tracking-widest text-[#121212] uppercase">
            REAL-TIME GAZE STABILITY CHART
          </h3>
        </div>
        
        {/* Toggle checkboxes for axis views */}
        <div className="flex flex-wrap gap-2 text-[9px] font-mono select-none">
          <button
            onClick={() => setShowX(!showX)}
            className={`px-2 py-1 border transition-all ${
              showX 
                ? 'bg-black text-white border-black font-extrabold' 
                : 'bg-white text-slate-400 border-black/20 hover:border-black/50 font-bold'
            }`}
          >
            {showX ? '☒' : '☐'} HORIZONTAL (X)
          </button>
          <button
            onClick={() => setShowY(!showY)}
            className={`px-2 py-1 border transition-all ${
              showY
                ? 'bg-emerald-600 text-white border-emerald-600 font-extrabold'
                : 'bg-white text-slate-400 border-black/20 hover:border-black/50 font-bold'
            }`}
          >
            {showY ? '☒' : '☐'} VERTICAL (Y)
          </button>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`px-2 py-1 border transition-all ${
              showRaw
                ? 'bg-amber-500 text-white border-amber-500 font-extrabold'
                : 'bg-white text-slate-400 border-black/20 hover:border-black/50 font-bold'
            }`}
          >
            {showRaw ? '☒' : '☐'} RAW UNFILTERED
          </button>
        </div>
      </div>

      <p className="text-[10px] font-mono text-slate-500 uppercase leading-relaxed">
        Visualizes screen tracking percentage <span className="text-black font-bold">(0 - 100%)</span> over a rolling 30-second window. High filter smoothing dampens physiological tremors/micro-saccades, resulting in a lag-stable trace versus jagged raw centroids.
      </p>

      {/* Chart Canvas */}
      <div className="w-full h-[180px] bg-[#F5F5F3] border border-black p-2 relative overflow-hidden">
        {data.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-slate-400 uppercase font-bold">
            Awaiting Gaze Waveforms Stream...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="rgba(18,18,18,0.06)" />
              <XAxis dataKey="timeId" hide />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#64748b' }}
                stroke="rgba(18,18,18,0.2)"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #121212',
                  borderRadius: 0,
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  color: '#121212',
                }}
                labelFormatter={() => 'SAMPLE'}
              />
              
              {/* Filtered Horizon X Line */}
              {showX && (
                <Line
                  type="monotone"
                  dataKey="filteredX"
                  stroke="#121212"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="Filtered X"
                  animating={false}
                />
              )}
              {/* Raw Horizon X Line */}
              {showX && showRaw && (
                <Line
                  type="monotone"
                  dataKey="rawX"
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  strokeWidth={1.2}
                  dot={false}
                  name="Raw X"
                  animating={false}
                />
              )}
              
              {/* Filtered Vertical Y Line */}
              {showY && (
                <Line
                  type="monotone"
                  dataKey="filteredY"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="Filtered Y"
                  animating={false}
                />
              )}
              {/* Raw Vertical Y Line */}
              {showY && showRaw && (
                <Line
                  type="monotone"
                  dataKey="rawY"
                  stroke="#10b981"
                  strokeDasharray="3 3"
                  strokeWidth={1.2}
                  dot={false}
                  name="Raw Y"
                  animating={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Dynamic parameters telemetry metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[9px] font-mono uppercase bg-[#F5F5F3] p-3 border border-black/10">
        <div className="flex flex-col">
          <span className="text-slate-400 font-bold">X Variance</span>
          <span className="text-black font-black">
            {data.length > 5 
              ? (Math.max(...data.slice(-30).map(d => d.filteredX)) - Math.min(...data.slice(-30).map(d => d.filteredX))).toFixed(1) + '%'
              : 'CALCING...'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-400 font-bold">Y Variance</span>
          <span className="text-black font-black">
            {data.length > 5 
              ? (Math.max(...data.slice(-30).map(d => d.filteredY)) - Math.min(...data.slice(-30).map(d => d.filteredY))).toFixed(1) + '%'
              : 'CALCING...'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-400 font-bold">Current Raw Wave</span>
          <span className="text-slate-600 font-bold">
            X: {Math.round(gazeState.rawX)}px
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-400 font-bold">Filtered Output</span>
          <span className="text-slate-600 font-bold">
            X: {Math.round(gazeState.x)}px Y: {Math.round(gazeState.y)}px
          </span>
        </div>
      </div>

    </div>
  );
};
