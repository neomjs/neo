---
id: 8330
title: '[Neural Link] Fix find_instances regression (Client mapping & OpenAPI)'
state: OPEN
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T11:19:58Z'
updatedAt: '2026-01-05T11:20:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8330'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Fix find_instances regression (Client mapping & OpenAPI)

Fix regression from previous session where `find_instances` was not fully integrated.

**Tasks:**
1.  **Client Mapping:** Add `find_instances` to the `serviceMap` in `src/ai/Client.mjs` to route requests to `InstanceService`.
2.  **OpenAPI Fix:** Investigate and fix the `openapi.yaml` file validation error that is preventing the Neural Link MCP server from starting.

## Activity Log

- 2026-01-05 @tobiu added the `bug` label
- 2026-01-05 @tobiu added the `ai` label
- 2026-01-05 @tobiu added parent issue #8169
- 2026-01-05 @tobiu assigned to @tobiu

