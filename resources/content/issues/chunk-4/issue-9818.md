---
id: 9818
title: Implement Vector Fast-Fail Guide Gap Analysis in DreamService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T11:06:40Z'
updatedAt: '2026-04-09T11:39:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9818'
author: tobiu
commentsCount: 1
parentIssue: 9816
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T11:39:01Z'
---
# Implement Vector Fast-Fail Guide Gap Analysis in DreamService

### Context
This task specifically targets the gap identified in discussion-9739 and relies on the standalone DreamService daemon. Currently, the autonomous swarm has no mechanisms to detect if heavily modified Source/Graph boundaries lack matching conceptual guides in `learn/guides`.

### Problem
Relying entirely on active LLM agents to blindly audit for missing documentation burns a staggering amount of context limits and API tokens.

### Solution
Implement a "Vector Fast-Fail" logic against the `neo-knowledge-base` inside the DreamService daemon. 
1. Check if semantic vectors exist linking to the structural node.
2. If vectors are weak or missing, immediately flag a gap. 
3. If vectors exist, only then utilize a localized LLM boolean prompt (YES/NO) to confirm validity.
4. Output verified results as `[GUIDE_GAP]` tasks in `sandman_handoff.md`.

## Timeline

- 2026-04-09T11:06:41Z @tobiu added the `enhancement` label
- 2026-04-09T11:06:41Z @tobiu added the `ai` label
- 2026-04-09T11:06:54Z @tobiu added parent issue #9816
- 2026-04-09T11:38:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T11:38:59Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Implemented Guide Gap Inference natively within `DreamService.mjs`!
> The daemon now utilizes the multi-MCP `QueryService` across to `knowledge-base` allowing for mathematical Vector Fast-Fail, and subsequent Boolean logic using Gemma4 to accurately identify and format `[GUIDE_GAP]` topological gaps in `sandman_handoff.md`.
> 
> This finalizes Sub-Issue #9818 constraints.

- 2026-04-09T11:39:01Z @tobiu closed this issue
- 2026-04-09T11:39:28Z @tobiu referenced in commit `76798f3` - "feat: Implement Fast-Fail Vector Inference Baseline (#9818)"
- 2026-04-09T11:39:45Z @tobiu cross-referenced by #9816

