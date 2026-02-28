/**
 * Computes the Exponential Moving Average (EMA).
 * @param current The current raw value.
 * @param previous The previous EMA value.
 * @param smoothingFactor The smoothing coefficient (alpha), e.g., 0.1 for vibration.
 * @returns The new EMA value.
 */
export function calculateEMA(current: number, previous: number | null, smoothingFactor: number = 0.1): number {
    if (previous === null) return current;
    return (current * smoothingFactor) + (previous * (1 - smoothingFactor));
}

/**
 * Calculates the Least-Squares Linear Regression slope for a given set of timestamped values.
 * @param dataPoints Array of [timestamp, value] tuples.
 * @returns The slope (m) representing the rate of change per second.
 */
export function calculateLinearRegression(dataPoints: [number, number][]): number {
    const n = dataPoints.length;
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
        const x = dataPoints[i][0];
        const y = dataPoints[i][1];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    const xMean = sumX / n;
    const yMean = sumY / n;

    const numerator = sumXY - (n * xMean * yMean);
    const denominator = sumX2 - (n * xMean * xMean);

    if (denominator === 0) return 0;

    return numerator / denominator;
}

/**
 * Estimates the Remaining Useful Life (RUL) in seconds based on linear projection.
 * @param currentVibration The current smoothed vibration value.
 * @param slope The calculated rate of change per second (m).
 * @param criticalThreshold The threshold at which the system fails (default 60).
 * @returns Estimated RUL in seconds. Returns Infinity if decreasing or stable.
 */
export function calculateRUL(currentVibration: number, slope: number, criticalThreshold: number = 60.0): number {
    // If slope is negative or zero, we aren't degrading towards the threshold
    if (slope <= 0) return Infinity;

    const remainingVibrationToThreshold = criticalThreshold - currentVibration;

    // If we've already crossed the threshold, RUL is 0
    if (remainingVibrationToThreshold <= 0) return 0;

    return remainingVibrationToThreshold / slope;
}
