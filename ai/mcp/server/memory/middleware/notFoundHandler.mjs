/**
 * Express middleware that handles unknown routes with a 404 response.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: {
            message: 'Endpoint not found',
            code   : 'not_found'
        }
    });
}

export default notFoundHandler;
