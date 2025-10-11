import {Router}         from 'express';
import asyncHandler     from '../middleware/asyncHandler.mjs';
import {listMemories, queryMemories} from '../services/memoryService.mjs';

const router = Router();

/**
 * GET /memories
 */
router.get('/memories', asyncHandler(async (req, res) => {
    const {sessionId} = req.query;
    let {limit = 100, offset = 0} = req.query;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        const error = new Error('The "sessionId" query parameter is required.');
        error.status = 400;
        throw error;
    }

    limit  = Number(limit);
    offset = Number(offset);

    if (Number.isNaN(limit) || limit < 1 || limit > 1000) {
        const error = new Error('The "limit" query parameter must be between 1 and 1000.');
        error.status = 400;
        throw error;
    }

    if (Number.isNaN(offset) || offset < 0) {
        const error = new Error('The "offset" query parameter must be 0 or greater.');
        error.status = 400;
        throw error;
    }

    const {total, results} = await listMemories({
        sessionId,
        limit,
        offset
    });

    res.status(200).json({
        sessionId,
        count: results.length,
        total,
        results
    });
}));

/**
 * POST /memories/query
 */
router.post('/memories/query', asyncHandler(async (req, res) => {
    const {query, nResults = 10, sessionId} = req.body ?? {};

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        const error = new Error('The "query" property is required in the request body.');
        error.status = 400;
        throw error;
    }

    if (sessionId && typeof sessionId !== 'string') {
        const error = new Error('If provided, "sessionId" must be a string.');
        error.status = 400;
        throw error;
    }

    const parsedResults = Number(nResults);

    if (Number.isNaN(parsedResults) || parsedResults < 1 || parsedResults > 100) {
        const error = new Error('The "nResults" value must be between 1 and 100.');
        error.status = 400;
        throw error;
    }

    const {count, results} = await queryMemories({
        query,
        nResults: parsedResults,
        sessionId
    });

    res.status(200).json({
        query,
        count,
        results
    });
}));

export default router;
