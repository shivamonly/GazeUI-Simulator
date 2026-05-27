export type GazeMode = 'dwell' | 'blink' | 'both';

export interface GazeConfig {
  camera: {
    width: number;
    height: number;
    fps: number;
  };
  tracking: {
    smoothingAlpha: number; // For EMA
    kalmanProcessNoise: number;
    kalmanMeasurementNoise: number;
    sensitivity: number; // For mapping raw eye movements to full screen edges
  };
  selection: {
    mode: GazeMode;
    dwellDurationMs: number;
    dwellRadiusPx: number;
    blinkEarThreshold: number;
    blinkMinDurationMs: number;
    blinkMaxDurationMs: number;
    cooldownMs: number;
  };
  calibration: {
    points: 5 | 9;
    sampleDurationS: number;
    polynomialDegree: number;
  };
  ui: {
    cursorSize: number;
    cursorColor: string;
    dwellRingColor: string;
    showDebugOverlay: boolean;
    audioFeedback: boolean;
  };
}

export interface CalibrationPoint {
  x: number;
  y: number;
  id: number;
}

export interface GazeState {
  x: number; // Screen X
  y: number; // Screen Y
  rawX: number; // Raw screen X (unfiltered)
  rawY: number; // Raw screen Y (unfiltered)
  gazeVector: [number, number]; // Normalized [-1, 1] gaze vector
  confidence: number;
  isTracking: boolean;
  isFacePresent: boolean;
  earCount: number; // Eye aspect ratio count or simulate blink
  isDwellActive: boolean;
  dwellProgress: number; // 0 to 1
  fps: number;
}

export interface GazeEvent {
  id: string;
  type: 'DWELL' | 'SINGLE_BLINK' | 'DOUBLE_BLINK' | 'CALIBRATION_POINT' | 'INFO';
  message: string;
  timestamp: string;
}

export interface InteractiveWidget {
  id: string;
  label: string;
  x: number; // pct or pixel
  y: number;
  w: number;
  h: number;
  color: string;
  action: () => void;
}
