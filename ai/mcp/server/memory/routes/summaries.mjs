import {Router}         from 'express';
import asyncHandler     from '../middleware/asyncHandler.mjs';
import {listSummaries}  from '../services/summaryService.mjs';

const router = Router();

/**
 * GET /summaries
 */
router.get('/summaries', asyncHandler(async (req, res) => {
    let {limit = '50', offset = '0'} = req.query;

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

    const {total, summaries} = await listSummaries({
        limit,
        offset
    });

    res.status(200).json({
        count: summaries.length,
        total,
        summaries
    });
}));

export default router;
