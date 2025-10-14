import {Router} from 'express';
import asyncHandler from '../middleware/asyncHandler.mjs';
import {checkoutPullRequest, createComment, getPullRequestDiff, listPullRequests} from '../services/pullRequestService.mjs';

const router = Router();

router.get('/pull-requests', asyncHandler(async (req, res) => {
    const {limit, state} = req.query;
    const data = await listPullRequests({limit, state});
    res.status(200).json(data);
}));

router.post('/pull-requests/:pr_number/checkout', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    const result = await checkoutPullRequest(pr_number);
    res.status(200).json(result);
}));

router.get('/pull-requests/:pr_number/diff', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    const diff = await getPullRequestDiff(pr_number);
    res.status(200).send(diff);
}));

router.post('/pull-requests/:pr_number/comments', asyncHandler(async (req, res) => {
    const {pr_number} = req.params;
    const {body} = req.body;
    const result = await createComment(pr_number, body);
    res.status(201).json(result);
}));

export default router;
