import {Router} from 'express';
import asyncHandler from '../middleware/asyncHandler.mjs';
import {listLabels} from '../services/labelService.mjs';

const router = Router();

router.get('/labels', asyncHandler(async (req, res) => {
    const data = await listLabels();
    res.status(200).json(data);
}));

export default router;
