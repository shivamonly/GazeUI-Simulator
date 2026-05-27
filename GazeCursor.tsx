import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

interface GazeCursorProps {
  x: number;
  y: number;
  isDwellActive: boolean;
  dwellProgress: number; // 0 to 1
  isBlinkActive: boolean;
  isTracking: boolean;
  cursorColor?: string;
  dwellRingColor?: string;
  cursorSize?: number;
}

export const GazeCursor: React.FC<GazeCursorProps> = ({
  x,
  y,
  isDwellActive,
  dwellProgress,
  isBlinkActive,
  isTracking,
  cursorColor = '#121212', // Pure Black
  dwellRingColor = '#121212', // Pure Black
  cursorSize = 22,
}) => {
  const mX = useMotionValue(x);
  const mY = useMotionValue(y);

  // Snappy yet fluid spring properties ideal for responsive cursor tracking
  const springConfig = { stiffness: 220, damping: 24, mass: 0.5 };
  const sX = useSpring(mX, springConfig);
  const sY = useSpring(mY, springConfig);

  useEffect(() => {
    mX.set(x);
    mY.set(y);
  }, [x, y, mX, mY]);

  if (!isTracking) return null;

  // Circle progress calculation (circumference of circle radius 15 = 2 * PI * 15 = ~94.2)
  const radius = 16;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (dwellProgress * circumference);

  // States
  // IDLE: Hollow circle
  // HOVER: Filled center
  // DWELLING: Closing circular arc
  // BLINK: Pulses red
  const isSelected = dwellProgress >= 0.99;

  return (
    <motion.div
      className="fixed pointer-events-none z-[9999]"
      style={{
        x: sX,
        y: sY,
        translateX: -cursorSize,
        translateY: -cursorSize,
        willChange: 'transform',
      }}
    >
      <div className="relative flex items-center justify-center" style={{ width: cursorSize * 2, height: cursorSize * 2 }}>
        
        {/* Starburst Flash Selection Pulse Ring */}
        {isSelected && (
          <div className="absolute w-12 h-12 rounded-full border-[6px] border-black opacity-0 flash-ring translate-x-[25%] translate-y-[25%]" />
        )}

        {/* Dynamic Vector feedback dots standard to GazeUI */}
        <div className="absolute w-1.5 h-1.5 rounded-full bg-black opacity-30 animate-ping" style={{ transform: 'scale(1.5)' }} />

        {/* Circular SVG tracker */}
        <svg width="40" height="40" viewBox="0 0 40 40" className="rotate-[-90deg]">
          {/* Base Track Layer */}
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill={isDwellActive ? 'rgba(18, 18, 18, 0.08)' : 'rgba(18, 18, 18, 0.03)'}
            stroke={isBlinkActive ? '#ef4444' : cursorColor}
            strokeWidth={1.5}
            className="transition-all duration-150"
            strokeOpacity={isDwellActive ? 0.3 : 0.6}
          />

          {/* Dwell Progress filling arc */}
          {isDwellActive && (
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke={dwellRingColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="square"
            />
          )}
        </svg>

        {/* Central Core Indicator Point */}
        <div
          className={`absolute w-2 h-2 rounded-full transition-all duration-100 ${
            isBlinkActive
              ? 'bg-red-600 scale-150'
              : isDwellActive
              ? 'bg-black scale-110'
              : 'bg-black'
          }`}
        />
        
        {/* Coordinate Text micro tag */}
        <div className="absolute top-10 left-10 bg-white px-2 py-0.5 border border-black text-[8px] font-mono text-black shadow-md tracking-wider uppercase font-black whitespace-nowrap">
          X:{Math.round(x)} Y:{Math.round(y)}
        </div>
      </div>
    </motion.div>
  );
};
