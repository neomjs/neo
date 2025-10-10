import {Router}        from 'express';
import asyncHandler    from '../middleware/asyncHandler.mjs';
import {listMemories}  from '../services/memoryService.mjs';

const router = Router();

/**
 * GET /memories
 */
router.get('/memories', asyncHandler(async (req, res) => {
    const {sessionId} = req.query;
    let {limit = '100', offset = '0'} = req.query;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        const error = new Error('The "sessionId" query parameter is required.');
        error.status = 400;
        throw error;
    }

    limit  = parseInt(limit, 10);
    offset = parseInt(offset, 10);

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

    const {total, memories} = await listMemories({
        sessionId,
        limit,
        offset
    });

    res.status(200).json({
        sessionId,
        count: memories.length,
        total,
        memories
    });
}));

export default router;
