import {Router} from 'express';
import asyncHandler from '../middleware/asyncHandler.mjs';
import {addLabels, removeLabels} from '../services/issueService.mjs';

const router = Router();

router.post('/issues/:issue_number/labels', asyncHandler(async (req, res) => {
    const {issue_number} = req.params;
    const {labels} = req.body;
    const result = await addLabels(issue_number, labels);
    res.status(200).json(result);
}));

router.delete('/issues/:issue_number/labels', asyncHandler(async (req, res) => {
    const {issue_number} = req.params;
    const {labels} = req.body;
    const result = await removeLabels(issue_number, labels);
    res.status(200).json(result);
}));

export default router;
