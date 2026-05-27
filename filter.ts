/**
 * GazeUI Smoothing Pipeline
 * Implements Exponential Moving Average (EMA) and 2D Kalman state projection filters.
 */

export class EMAFilter {
  private alpha: number;
  private stateX: number | null = null;
  private stateY: number | null = null;

  constructor(alpha = 0.6) {
    this.alpha = alpha;
  }

  public setAlpha(alpha: number) {
    this.alpha = alpha;
  }

  public update(x: number, y: number): [number, number] {
    if (this.stateX === null || this.stateY === null) {
      this.stateX = x;
      this.stateY = y;
    } else {
      this.stateX = this.alpha * x + (1 - this.alpha) * this.stateX;
      this.stateY = this.alpha * y + (1 - this.alpha) * this.stateY;
    }
    return [this.stateX, this.stateY];
  }

  public reset() {
    this.stateX = null;
    this.stateY = null;
  }
}

/**
 * 2D Kalman Filter for trajectory smoothing
 * Tracks state [x, y, vx, vy] derived from positions [x, y]
 */
export class Kalman2DFilter {
  // State: [x, y, vx, vy] (4 dimensions)
  private x = [0, 0, 0, 0];
  
  // Covariance Matrix (4x4)
  private P = [
    [100, 0, 0, 0],
    [0, 100, 0, 0],
    [0, 0, 100, 0],
    [0, 0, 0, 100]
  ];

  // Process Noise Covariance (4x4)
  private Q = [
    [0.01, 0, 0, 0],
    [0, 0.01, 0, 0],
    [0, 0, 0.02, 0],
    [0, 0, 0, 0.02]
  ];

  // Measurement Noise Covariance (2x2)
  private R = [
    [10.0, 0],
    [0, 10.0]
  ];

  private dt = 1 / 30.0; // Assume 30 FPS tickrate
  private initialized = false;

  constructor(processNoise = 0.01, measurementNoise = 10.0) {
    this.setNoise(processNoise, measurementNoise);
  }

  public setNoise(processNoise: number, measurementNoise: number) {
    this.Q = [
      [processNoise, 0, 0, 0],
      [0, processNoise, 0, 0],
      [0, 0, processNoise * 2, 0],
      [0, 0, 0, processNoise * 2]
    ];
    this.R = [
      [measurementNoise, 0],
      [0, measurementNoise]
    ];
  }

  public reset() {
    this.initialized = false;
  }

  public update(zX: number, zY: number): [number, number] {
    if (!this.initialized) {
      this.x = [zX, zY, 0, 0];
      this.initialized = true;
      return [zX, zY];
    }

    // 1. Predict Step
    // x = F * x
    const xPredX = this.x[0] + this.dt * this.x[2];
    const xPredY = this.x[1] + this.dt * this.x[3];
    const xPredVx = this.x[2];
    const xPredVy = this.x[3];

    // P = F * P * F^T + Q
    // We construct F * P * F^T where F is:
    // [1, 0, dt, 0]
    // [0, 1, 0, dt]
    // [0, 0, 1,  0]
    // [0, 0, 0,  1]
    const FPFT = Array.from({ length: 4 }, () => new Array(4).fill(0));
    const dt = this.dt;

    FPFT[0][0] = this.P[0][0] + dt * (this.P[2][0] + this.P[0][2] + dt * this.P[2][2]);
    FPFT[0][1] = this.P[0][1] + dt * (this.P[2][1] + this.P[0][3] + dt * this.P[2][3]);
    FPFT[0][2] = this.P[0][2] + dt * this.P[2][2];
    FPFT[0][3] = this.P[0][3] + dt * this.P[2][3];

    FPFT[1][0] = this.P[1][0] + dt * (this.P[3][0] + this.P[1][2] + dt * this.P[3][2]);
    FPFT[1][1] = this.P[1][1] + dt * (this.P[3][1] + this.P[1][3] + dt * this.P[3][3]);
    FPFT[1][2] = this.P[1][2] + dt * this.P[3][2];
    FPFT[1][3] = this.P[1][3] + dt * this.P[3][3];

    FPFT[2][0] = this.P[2][0] + dt * this.P[2][2];
    FPFT[2][1] = this.P[2][1] + dt * this.P[2][3];
    FPFT[2][2] = this.P[2][2];
    FPFT[2][3] = this.P[2][3];

    FPFT[3][0] = this.P[3][0] + dt * this.P[3][2];
    FPFT[3][1] = this.P[3][1] + dt * this.P[3][3];
    FPFT[3][2] = this.P[3][2];
    FPFT[3][3] = this.P[3][3];

    // P_pred = FPFT + Q
    const PPred = Array.from({ length: 4 }, (u, r) => 
      Array.from({ length: 4 }, (v, c) => FPFT[r][c] + this.Q[r][c])
    );

    // 2. Innovation Step
    // Innovation y = z - H * x_pred
    // H is [[1,0,0,0], [0,1,0,0]]
    const yX = zX - xPredX;
    const yY = zY - xPredY;

    // Innovation Covariance S = H * P_pred * H^T + R
    // H * P_pred * H^T extracts the upper-left 2x2 block of P_pred
    const s00 = PPred[0][0] + this.R[0][0];
    const s01 = PPred[0][1] + this.R[0][1];
    const s10 = PPred[1][0] + this.R[1][0];
    const s11 = PPred[1][1] + this.R[1][1];

    // Invert S (2x2 matrix)
    const detS = s00 * s11 - s01 * s10;
    if (Math.abs(detS) < 1e-9) return [xPredX, xPredY]; // Singular fallback

    const sInv00 = s11 / detS;
    const sInv01 = -s01 / detS;
    const sInv10 = -s10 / detS;
    const sInv11 = s00 / detS;

    // Kalman Gain K = P_pred * H^T * S^-1
    // P_pred * H^T is the 4x2 left-hand sub-matrix of PPred
    const K = Array.from({ length: 4 }, () => new Array(2).fill(0));
    for (let i = 0; i < 4; i++) {
      // row i of gain K
      const ph0 = PPred[i][0];
      const ph1 = PPred[i][1];
      K[i][0] = ph0 * sInv00 + ph1 * sInv10;
      K[i][1] = ph0 * sInv01 + ph1 * sInv11;
    }

    // Since we now have gained values, we update the State: x = x_pred + K * y
    this.x[0] = xPredX + K[0][0] * yX + K[0][1] * yY;
    this.x[1] = xPredY + K[1][0] * yX + K[1][1] * yY;
    this.x[2] = xPredVx + K[2][0] * yX + K[2][1] * yY;
    this.x[3] = xPredVy + K[3][0] * yX + K[3][1] * yY;

    // Covariance update: P = (I - K * H) * P_pred
    // K * H is (4x2) * (2x4) = (4x4)
    // I_KH = I - KH
    const I_KH = Array.from({ length: 4 }, (u, r) => 
      Array.from({ length: 4 }, (v, c) => {
        const id = r === c ? 1 : 0;
        // H only has ones at [0][0] and [1][1]
        const kh = (c === 0 ? K[r][0] : 0) + (c === 1 ? K[r][1] : 0);
        return id - kh;
      })
    );

    // P = I_KH * P_pred
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += I_KH[r][k] * PPred[k][c];
        }
        this.P[r][c] = sum;
      }
    }

    return [this.x[0], this.x[1]];
  }
}

/**
 * Combined Gaze Smoothing Filter
 */
export class GazeSmoother {
  private ema: EMAFilter;
  private kalman: Kalman2DFilter;
  private lastX = 0;
  private lastY = 0;

  constructor(alpha = 0.5, processNoise = 0.01, measurementNoise = 10.0) {
    this.ema = new EMAFilter(alpha);
    this.kalman = new Kalman2DFilter(processNoise, measurementNoise);
  }

  public setParams(alpha: number, processNoise: number, measurementNoise: number) {
    this.ema.setAlpha(alpha);
    this.kalman.setNoise(processNoise, measurementNoise);
  }

  public update(rawX: number, rawY: number): [number, number] {
    // Stage 1: EMA
    const [emaX, emaY] = this.ema.update(rawX, rawY);
    
    // Stage 2: Kalman
    const [smoothX, smoothY] = this.kalman.update(emaX, emaY);

    // Adaptive speed adjustment (Saccade compensation)
    const dx = smoothX - this.lastX;
    const dy = smoothY - this.lastY;
    const velocity = Math.sqrt(dx * dx + dy * dy) * 30; // pixels per second approx

    if (velocity > 600) {
      // Fast movement (Saccade) -> decrease smoothing to follow gaze rapidly
      this.ema.setAlpha(0.85);
    } else {
      // Normal movement (Fixation) -> increase smoothing for ultra stable select experience
      this.ema.setAlpha(0.4);
    }

    this.lastX = smoothX;
    this.lastY = smoothY;

    return [smoothX, smoothY];
  }

  public reset() {
    this.ema.reset();
    this.kalman.reset();
  }
}
