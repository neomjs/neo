import {Router} from 'express';
import asyncHandler from '../middleware/asyncHandler.mjs';
import {checkoutPullRequest, getPullRequestDiff, listPullRequests} from '../services/pullRequestService.mjs';

const router = Router();

router.get('/pull-requests', asyncHandler(async (req, res) => {
    const limit = req.query.limit || 30;
    const data = await listPullRequests(limit);
    res.status(200).json(data);
}));

router.post('/pull-requests/:pr_number/checkout', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    const result = await checkoutPullRequest(pr_number);
    res.status(200).json(result);
}));

// Placeholder: GET /pull-requests/:pr_number/diff
router.get('/pull-requests/:pr_number/diff', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    const diff = await getPullRequestDiff(pr_number);
    res.status(200).send(diff);
}));

export default router;
