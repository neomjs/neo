---
id: 9650
title: 'Sub-Epic 3B: Implement Graph Node Extraction Prompt via local Gemma-4'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T11:04:25Z'
updatedAt: '2026-04-03T11:14:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9650'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T11:14:23Z'
---
# Sub-Epic 3B: Implement Graph Node Extraction Prompt via local Gemma-4

In `DreamService.mjs`, wire up connection to `Neo.ai.provider.Ollama` utilizing `gemma-4-31b-it`. Construct the strict Extraction prompt designed to distill raw episodic JSON memories into formal JSON Entities & Relationships graph format.
Parent Epic: #9641

## Timeline

- 2026-04-03T11:04:27Z @tobiu added the `enhancement` label
- 2026-04-03T11:04:28Z @tobiu added the `ai` label
- 2026-04-03T11:14:19Z @tobiu referenced in commit `271f323` - "feat: Implement Graph Node Extraction Prompt via local Gemma-4 (#9650)"
- 2026-04-03T11:14:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-03T11:14:23Z

Implemented Neo.mjs REM Extraction Prompt parsing episodic dumps into GraphRAG Nodes and Edges.

- 2026-04-03T11:14:23Z @tobiu closed this issue

