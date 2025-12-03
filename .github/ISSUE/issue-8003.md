---
id: 8003
title: Make AI Tooling Dependencies Optional
state: OPEN
labels:
  - enhancement
  - dependencies
  - ai
assignees: []
createdAt: '2025-12-03T01:50:54Z'
updatedAt: '2025-12-03T01:50:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8003'
author: tobiu
commentsCount: 0
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Make AI Tooling Dependencies Optional

The `ws` dependency was added to `devDependencies` for the App Worker MCP Server PoC. However, the AI tooling should be strictly optional and not bloat the core dev dependencies if possible.

**Tasks:**
1.  Investigate if `ws` can be a peer dependency or dynamically imported only when needed by the `app-worker` server.
2.  Ensure that standard Neo.mjs development (without AI features) is not affected by this dependency.
3.  Verify that `npm install` remains clean for non-AI users.

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu added the `dependencies` label
- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu added parent issue #7960

