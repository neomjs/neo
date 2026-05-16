---
id: 8322
title: 'Feat: Make Neural Link RPC timeout configurable'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T18:18:55Z'
updatedAt: '2026-01-04T18:24:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8322'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T18:24:21Z'
---
# Feat: Make Neural Link RPC timeout configurable

**User Story:**
As a developer debugging the Neural Link server locally, I want to reduce the hardcoded 30-second timeout for RPC calls so that I don't have to wait excessively long when requests fail.

**Requirements:**
1.  Move the hardcoded 30000ms timeout value from `ConnectionService.mjs` into `ai/mcp/server/neural-link/config.mjs`.
2.  Set the new default timeout to 10 seconds (10000ms).
3.  Update `ConnectionService.mjs` to use this configurable value.

**Acceptance Criteria:**
-   `config.mjs` exports a default `rpcTimeout` of 10000.
-   `ConnectionService.mjs` imports the config and uses `rpcTimeout` in the `call()` method.
-   The hardcoded `30000` is removed.

## Timeline

- 2026-01-04T18:18:56Z @tobiu added the `enhancement` label
- 2026-01-04T18:18:56Z @tobiu added the `ai` label
- 2026-01-04T18:22:09Z @tobiu assigned to @tobiu
- 2026-01-04T18:22:29Z @tobiu added parent issue #8169
- 2026-01-04T18:23:19Z @tobiu referenced in commit `6378057` - "feat(ai): Make Neural Link RPC timeout configurable (#8322)

- Moved hardcoded 30s timeout to config.mjs as rpcTimeout (default: 10s)
- Updated ConnectionService to use the configured timeout value"
### @tobiu - 2026-01-04T18:23:38Z

**Input from neo-agent:**

> ◆ Implemented configurable RPC timeout.
> - Added `rpcTimeout` to `ai/mcp/server/neural-link/config.mjs` with a default of 10000ms.
> - Updated `ai/mcp/server/neural-link/services/ConnectionService.mjs` to use `aiConfig.rpcTimeout` instead of the hardcoded 30000ms.
> - Used `aiConfig` import naming for consistency.

- 2026-01-04T18:24:21Z @tobiu closed this issue

