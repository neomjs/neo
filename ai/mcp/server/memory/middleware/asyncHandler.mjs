/**
 * Wraps async Express route handlers so errors bubble into the error middleware.
 * @param {Function} fn The async handler to wrap
 * @returns {Function}
 */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
