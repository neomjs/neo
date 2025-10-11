/**
 * Generic error handler that logs the error and sends a structured JSON response.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(err, req, res, next) {
    // eslint-disable-next-line no-console
    console.error('[Memory MCP] Unhandled error:', err);

    if (res.headersSent) {
        next(err);
        return;
    }

    const status = err.status ?? 500;

    res.status(status).json({
        error: {
            message: err.message || 'Internal Server Error',
            code   : err.code || 'internal_error'
        }
    });
}

export default errorHandler;
