import {Router} from 'express';
import asyncHandler from '../middleware/asyncHandler.mjs';

const router = Router();

// Placeholder: GET /pull-requests
router.get('/pull-requests', asyncHandler(async (req, res) => {
    res.status(200).json({message: 'List of pull requests (to be implemented)'});
}));

// Placeholder: POST /pull-requests/:pr_number/checkout
router.post('/pull-requests/:pr_number/checkout', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    res.status(200).json({message: `Checked out PR #${pr_number} (to be implemented)`});
}));

// Placeholder: GET /pull-requests/:pr_number/diff
router.get('/pull-requests/:pr_number/diff', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    res.status(200).send(`Diff for PR #${pr_number} (to be implemented)`);
}));

export default router;
