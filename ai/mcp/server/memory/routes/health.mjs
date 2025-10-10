import {Router}          from 'express';
import asyncHandler      from '../middleware/asyncHandler.mjs';
import {buildHealthResponse} from '../services/healthService.mjs';

const router = Router();

router.get('/healthcheck', asyncHandler(async (req, res) => {
    const payload = await buildHealthResponse();

    res.status(200).json(payload);
}));

export default router;
