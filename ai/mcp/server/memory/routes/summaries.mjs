import {Router}         from 'express';
import asyncHandler     from '../middleware/asyncHandler.mjs';
import {listSummaries, querySummaries} from '../services/summaryService.mjs';

const router = Router();

/**
 * GET /summaries
 */
router.get('/summaries', asyncHandler(async (req, res) => {
    let {limit = 50, offset = 0} = req.query;

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

    const {total, results} = await listSummaries({
        limit,
        offset
    });

    res.status(200).json({
        count: results.length,
        total,
        results
    });
}));

router.post('/summaries/query', asyncHandler(async (req, res) => {
    const {query, nResults = 10, category} = req.body ?? {};

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        const error = new Error('The "query" property is required in the request body.');
        error.status = 400;
        throw error;
    }

    if (category && typeof category !== 'string') {
        const error = new Error('If provided, "category" must be a string.');
        error.status = 400;
        throw error;
    }

    if (category) {
        const allowedCategories = req.app?.locals?.summaryCategories;

        if (Array.isArray(allowedCategories) && allowedCategories.length > 0 && !allowedCategories.includes(category)) {
            const error = new Error(`Invalid category "${category}". Supported categories: ${allowedCategories.join(', ')}`);
            error.status = 400;
            throw error;
        }
    }

    const parsedResults = Number(nResults);

    if (Number.isNaN(parsedResults) || parsedResults < 1 || parsedResults > 100) {
        const error = new Error('The "nResults" value must be between 1 and 100.');
        error.status = 400;
        throw error;
    }

    const {count, results} = await querySummaries({
        query,
        nResults: parsedResults,
        category
    });

    res.status(200).json({
        query,
        count,
        results
    });
}));

export default router;
