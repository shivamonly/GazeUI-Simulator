import React from 'react';

interface SimulatorFaceProps {
  isTracking: boolean;
  gazeX: number;
  gazeY: number;
  isBlinkActive: boolean;
  width?: number;
  height?: number;
}

export const SimulatorFace: React.FC<SimulatorFaceProps> = ({
  isTracking,
  gazeX,
  gazeY,
  isBlinkActive,
  width = 180,
  height = 140,
}) => {
  // Compute pupil offsets based on gaze coords relative to window size
  const normX = (gazeX / window.innerWidth - 0.5) * 2; // -1 to 1
  const normY = (gazeY / window.innerHeight - 0.5) * 2; // -1 to 1

  // Clamp pupil movement bounds
  const px = Math.max(-6, Math.min(6, normX * 6));
  const py = Math.max(-5, Math.min(5, normY * 5));

  // Eyes coordinates relative to face SVG box
  const eyeLeftX = 65;
  const eyeRightX = 115;
  const eyesY = 65;

  return (
    <div className="relative flex flex-col items-center justify-center p-3 border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-black animate-pulse' : 'bg-slate-300'}`} />
        <span className="text-[10px] font-mono tracking-wider text-black font-bold uppercase">
          {isTracking ? 'SIM_ACTIVE' : 'SIM_IDLE'}
        </span>
      </div>

      <svg
        width={width}
        height={height}
        viewBox="0 0 180 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-[#121212] transition-colors duration-300"
      >
        {/* Face Outline */}
        <path
          d="M35 50C35 25 55 15 90 15C125 15 145 25 145 50C145 85 130 115 90 115C50 115 35 85 35 50Z"
          stroke="currentColor"
          strokeWidth="1.5"
          className={isTracking ? 'text-black/30' : 'text-slate-200'}
        />

        {/* Nose Line Bridge */}
        <path
          d="M90 60V85H84"
          stroke="currentColor"
          strokeWidth="1.5"
          className={isTracking ? 'text-black/40' : 'text-slate-200'}
        />

        {/* Mouth Mesh Tracker */}
        <path
          d="M75 95C75 95 82 98 90 98C98 98 105 95 105 95"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={isTracking ? 'text-black/30' : 'text-slate-200'}
        />

        {/* Left Eye Sclera */}
        <ellipse
          cx={eyeLeftX}
          cy={eyesY}
          rx="18"
          ry={isBlinkActive ? "1" : "9"}
          stroke={isTracking ? '#121212' : '#cccccc'}
          strokeWidth="1.5"
          fill="#ffffff"
          className="transition-all duration-75"
        />

        {/* Right Eye Sclera */}
        <ellipse
          cx={eyeRightX}
          cy={eyesY}
          rx="18"
          ry={isBlinkActive ? "1" : "9"}
          stroke={isTracking ? '#121212' : '#cccccc'}
          strokeWidth="1.5"
          fill="#ffffff"
          className="transition-all duration-75"
        />

        {/* Left Iris and Pupil */}
        {!isBlinkActive && (
          <g transform={`translate(${px}, ${py})`}>
            {/* Iris */}
            <circle cx={eyeLeftX} cy={eyesY} r="7" fill="#555555" opacity="0.8" />
            {/* Pupil */}
            <circle cx={eyeLeftX} cy={eyesY} r="3.5" fill="#121212" />
            {/* Reflection Glint */}
            <circle cx={eyeLeftX - 2.5} cy={eyesY - 2.5} r="1.2" fill="#ffffff" />
          </g>
        )}

        {/* Right Iris and Pupil */}
        {!isBlinkActive && (
          <g transform={`translate(${px}, ${py})`}>
            {/* Iris */}
            <circle cx={eyeRightX} cy={eyesY} r="7" fill="#555555" opacity="0.8" />
            {/* Pupil */}
            <circle cx={eyeRightX} cy={eyesY} r="3.5" fill="#121212" />
            {/* Reflection Glint */}
            <circle cx={eyeRightX - 2.5} cy={eyesY - 2.5} r="1.2" fill="#ffffff" />
          </g>
        )}

        {/* Facial Vector Grid Metrics overlay (MediaPipe simulator) */}
        {isTracking && (
          <g opacity="0.3" stroke="#121212" strokeWidth="0.8" strokeDasharray="1,3">
            {/* Mesh Lines */}
            <line x1="90" y1="15" x2="90" y2="115" />
            <line x1="35" y1="50" x2="145" y2="50" />
            <line x1="65" y1="65" x2="90" y2="60" />
            <line x1="115" y1="65" x2="90" y2="60" />
            <line x1="65" y1="65" x2="90" y2="85" />
            <line x1="115" y1="65" x2="90" y2="85" />
            
            {/* Tiny trackers */}
            <circle cx="90" cy="15" r="1.5" fill="#121212" />
            <circle cx="90" cy="60" r="1.5" fill="#121212" />
            <circle cx="90" cy="85" r="1.5" fill="#121212" />
            <circle cx="35" cy="50" r="1.5" fill="#121212" />
            <circle cx="145" cy="50" r="1.5" fill="#121212" />
          </g>
        )}
      </svg>

      <div className="w-full mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="bg-[#F5F5F3] p-1.5 border border-black">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider font-bold">IRIS_COV_X</p>
          <p className="text-[11px] font-mono font-black text-black">
            {isTracking ? px.toFixed(2) : '0.00'}
          </p>
        </div>
        <div className="bg-[#F5F5F3] p-1.5 border border-black">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider font-bold">IRIS_COV_Y</p>
          <p className="text-[11px] font-mono font-black text-black">
            {isTracking ? py.toFixed(2) : '0.00'}
          </p>
        </div>
      </div>
    </div>
  );
};
