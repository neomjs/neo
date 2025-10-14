import {Router} from 'express';
import asyncHandler from '../middleware/asyncHandler.mjs';
import {listTools, callTool} from '../services/toolService.mjs';

const router = Router();

router.get('/tools/list', asyncHandler(async (req, res) => {
    const tools = listTools();
    res.status(200).json(tools);
}));

router.post('/tools/call', asyncHandler(async (req, res) => {
    const {toolName, args} = req.body;
    const result = await callTool(toolName, args);
    res.status(200).json(result);
}));

export default router;
