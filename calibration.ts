/**
 * GazeUI Calibration Engine
 * Fits 2nd-degree polynomial mappings from iris-space to screen-space coordinates.
 */

// Helper to calculate a 2nd-degree polynomial feature vector for a gaze vector g = [gx, gy]
export function buildFeatures(gx: number, gy: number): number[] {
  return [
    1,
    gx,
    gy,
    gx * gx,
    gy * gy,
    gx * gy
  ];
}

// Simple Gaussian Elimination with partial pivoting to solve M * c = Y
export function solveLinearSystem(M: number[][], Y: number[]): number[] | null {
  const n = Y.length;
  const A: number[][] = [];
  
  // Clone M and append Y as the augmented column
  for (let i = 0; i < n; i++) {
    A.push([...M[i], Y[i]]);
  }

  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    const temp = A[maxRow];
    A[maxRow] = A[i];
    A[i] = temp;

    // Make all rows below this one 0 in current column
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-9) {
      // Singular matrix
      return null;
    }

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / pivot;
      for (let j = i; j <= n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
    }
  }

  // Solve equation Ax = b for an upper triangular matrix A
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let k = i + 1; k < n; k++) {
      sum -= A[i][k] * x[k];
    }
    x[i] = sum / A[i][i];
  }

  return x;
}

export class CalibrationEngine {
  public coefX: number[] | null = null;
  public coefY: number[] | null = null;
  private degree = 2;

  /**
   * Fits polynomial coefficients using Ordinary Least Squares with L2 Ridge Regularization.
   * glazeSamples: array of normalized gaze points [gx, gy], range approx [-1, 1]
   * screenTargets: array of raw screen points [sx, sy]
   */
  public fit(gazeSamples: [number, number][], screenTargets: [number, number][]): number {
    const N = gazeSamples.length;
    if (N < 6) {
      // Fallback: we don't have enough points for quadratic. Let's do a simple linear fit!
      this.fitLinearFallback(gazeSamples, screenTargets);
      return 120; // Return dummy error
    }

    const nFeatures = 6;
    
    // Construct Design Matrix X (N x 6)
    const X: number[][] = [];
    for (let i = 0; i < N; i++) {
      X.push(buildFeatures(gazeSamples[i][0], gazeSamples[i][1]));
    }

    // Compute Left Hand Side: M = X^T * X (6 x 6)
    const M: number[][] = Array.from({ length: nFeatures }, () => new Array(nFeatures).fill(0));
    for (let r = 0; r < nFeatures; r++) {
      for (let c = 0; c < nFeatures; c++) {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          sum += X[i][r] * X[i][c];
        }
        M[r][c] = sum;
      }
      // Add ridge regularization to diagonal for extreme mathematical stability
      M[r][r] += 1e-4;
    }

    // Compute Right Hand Side: Y_x = X^T * targets_x, Y_y = X^T * targets_y
    const Yy: number[] = new Array(nFeatures).fill(0);
    const Yx: number[] = new Array(nFeatures).fill(0);

    for (let r = 0; r < nFeatures; r++) {
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < N; i++) {
        sumX += X[i][r] * screenTargets[i][0];
        sumY += X[i][r] * screenTargets[i][1];
      }
      Yx[r] = sumX;
      Yy[r] = sumY;
    }

    // Solve for coefficients
    const solX = solveLinearSystem(M, Yx);
    const solY = solveLinearSystem(M, Yy);

    if (solX && solY) {
      this.coefX = solX;
      this.coefY = solY;
      return this.computeMeanAbsoluteError(gazeSamples, screenTargets);
    } else {
      // Fallback
      this.fitLinearFallback(gazeSamples, screenTargets);
      return 150;
    }
  }

  private fitLinearFallback(gazeSamples: [number, number][], screenTargets: [number, number][]) {
    // 1st-degree polynomial fallback mapping (Affine transform)
    // s_x = a*gx + b*gy + c
    // Solve with 3 features: [1, gx, gy]
    const nFeatures = 3;
    const N = gazeSamples.length;
    if (N < 3) {
      // Dumbest projection: map bounds directly to viewport size
      this.coefX = [960, 500, 0, 0, 0, 0];
      this.coefY = [540, 0, 300, 0, 0, 0];
      return;
    }

    const X: number[][] = gazeSamples.map(g => [1, g[0], g[1]]);
    const M: number[][] = Array.from({ length: nFeatures }, () => new Array(nFeatures).fill(0));
    for (let r = 0; r < nFeatures; r++) {
      for (let c = 0; c < nFeatures; c++) {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          sum += X[i][r] * X[i][c];
        }
        M[r][c] = sum;
      }
      M[r][r] += 1e-4;
    }

    const Yx: number[] = new Array(nFeatures).fill(0);
    const Yy: number[] = new Array(nFeatures).fill(0);
    for (let r = 0; r < nFeatures; r++) {
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < N; i++) {
        sumX += X[i][r] * screenTargets[i][0];
        sumY += X[i][r] * screenTargets[i][1];
      }
      Yx[r] = sumX;
      Yy[r] = sumY;
    }

    const solX = solveLinearSystem(M, Yx);
    const solY = solveLinearSystem(M, Yy);

    if (solX && solY) {
      // Pad to 6 features: [1, gx, gy, 0, 0, 0]
      this.coefX = [solX[0], solX[1], solX[2], 0, 0, 0];
      this.coefY = [solY[0], solY[1], solY[2], 0, 0, 0];
    } else {
      this.coefX = [960, 500, 0, 0, 0, 0];
      this.coefY = [540, 0, 300, 0, 0, 0];
    }
  }

  public transform(gx: number, gy: number): [number, number] {
    if (!this.coefX || !this.coefY) {
      // Uncalibrated. Project simple linear mapping
      const sx = (gx + 0.5) * window.innerWidth;
      const sy = (gy + 0.5) * window.innerHeight;
      return [sx, sy];
    }

    const phi = buildFeatures(gx, gy);
    
    // Dot products
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 6; i++) {
      sx += phi[i] * this.coefX[i];
      sy += phi[i] * this.coefY[i];
    }

    return [sx, sy];
  }

  // Under Leave-One-Out validation error or training error
  private computeMeanAbsoluteError(gazeSamples: [number, number][], screenTargets: [number, number][]): number {
    let totalError = 0;
    const N = gazeSamples.length;
    for (let i = 0; i < N; i++) {
      const [px, py] = this.transform(gazeSamples[i][0], gazeSamples[i][1]);
      const [tx, ty] = screenTargets[i];
      const dist = Math.sqrt((px - tx) ** 2 + (py - ty) ** 2);
      totalError += dist;
    }
    return totalError / N;
  }
}
