---
id: 9913
title: 'fix(ai): Implement JSON recovery/repair in DreamService Tri-Vector Synthesis'
state: OPEN
labels:
  - bug
  - ai
  - architecture
assignees: []
createdAt: '2026-04-12T11:37:20Z'
updatedAt: '2026-04-12T11:37:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9913'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# fix(ai): Implement JSON recovery/repair in DreamService Tri-Vector Synthesis

# Bulletproof Tri-Vector JSON Synthesis

### Context
Sandman is regularly failing to digest large sessions due to `[WARN] Failed to validate extracted Tri-Vector A2A payload`. The local OS LLM is occasionally generating trailing text or invalid quote schemas during extraction, breaking Zod strict validation.

### Objective
We must implement a JSON-repair loop (e.g., regex sanitization, AST validation) or an automated LLM retry mechanism natively inside `executeTriVectorExtraction` before dumping the payload.

## Timeline

- 2026-04-12T11:37:20Z @tobiu added the `bug` label
- 2026-04-12T11:37:21Z @tobiu added the `ai` label
- 2026-04-12T11:37:21Z @tobiu added the `architecture` label

