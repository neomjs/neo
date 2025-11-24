---
id: 7887
title: Index `ai/` directory in Knowledge Base
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T19:40:38Z'
updatedAt: '2025-11-23T19:41:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7887'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Index `ai/` directory in Knowledge Base

The current `DatabaseService.mjs` relies on `docs/output/all.json` for source code indexing, which only covers `src/` and `apps/`. The `ai/` directory (SDK, MCP servers, examples) is missing.

We need to enhance `DatabaseService.mjs` to:
1. Recursively scan the `ai/` directory.
2. Read `.mjs` files.
3. Treat them as knowledge chunks (type: 'src' or 'ai-sdk').
4. Ensure `ai/examples` are indexed with type 'example'.

This is critical for the "Code Execution" pattern, as agents need to know the SDK API (`ai/services.mjs`) to write valid scripts.

## Activity Log

- 2025-11-23 @tobiu added the `enhancement` label
- 2025-11-23 @tobiu added the `ai` label
- 2025-11-23 @tobiu assigned to @tobiu

