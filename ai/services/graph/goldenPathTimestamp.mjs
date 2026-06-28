/**
 * @module ai/services/graph/goldenPathTimestamp
 * @summary Pure capture-timestamp formatter for the Golden Path render sections. Extracted out of
 * `GoldenPathSynthesizer` (the SRP-decomposition) as a shared helper so the render sections share one
 * formatter and the lane clusters that depend on it can be extracted cleanly. No I/O; pure.
 */

/**
 * @summary Formats a Golden Path section capture timestamp as `YYYY-MM-DD HH:MM UTC`, or `'unknown'` for a
 * non-finite / unparseable input.
 *
 * @param {Date|String} capturedAt Capture timestamp.
 * @returns {String}
 */
export function formatGoldenPathCapturedAt(capturedAt) {
    const date = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);

    if (!Number.isFinite(date.getTime())) {
        return 'unknown'
    }

    return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}
