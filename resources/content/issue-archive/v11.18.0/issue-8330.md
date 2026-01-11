---
id: 8330
title: '[Neural Link] Fix find_instances regression (Client mapping & OpenAPI)'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T11:19:58Z'
updatedAt: '2026-01-05T11:24:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8330'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T11:24:49Z'
---
# [Neural Link] Fix find_instances regression (Client mapping & OpenAPI)

Fix regression from previous session where `find_instances` was not fully integrated.

**Tasks:**
1.  **Client Mapping:** Add `find_instances` to the `serviceMap` in `src/ai/Client.mjs` to route requests to `InstanceService`.
2.  **OpenAPI Fix:** Investigate and fix the `openapi.yaml` file validation error that is preventing the Neural Link MCP server from starting.

## Timeline

- 2026-01-05T11:19:59Z @tobiu added the `bug` label
- 2026-01-05T11:19:59Z @tobiu added the `ai` label
- 2026-01-05T11:20:07Z @tobiu added parent issue #8169
- 2026-01-05T11:20:26Z @tobiu assigned to @tobiu
- 2026-01-05T11:24:16Z @tobiu referenced in commit `12898b6` - "Fix find_instances regression: Add missing Client mapping and Server implementation #8330"
### @tobiu - 2026-01-05T11:24:21Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the regression.
> 
> **Fixes:**
> 1.  **Server Startup Crash:** The `Neural Link` server was failing to start because `toolService.mjs` was attempting to bind `find_instances` to `InstanceService.findInstances`, which was undefined. I have implemented the missing `findInstances` method in `ai/mcp/server/neural-link/services/InstanceService.mjs`.
> 2.  **Client Mapping:** I have added the missing `find_instances` mapping to the `serviceMap` in `src/ai/Client.mjs`, ensuring client-side requests are correctly routed.
> 3.  **OpenAPI Integrity:** I verified `openapi.yaml` and confirmed the schema is correct. The "corrupted shapes" error was likely a side effect of the server crashing before it could fully validate the schema or due to the missing method reference.

- 2026-01-05T11:24:50Z @tobiu closed this issue

