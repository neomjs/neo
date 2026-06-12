---
id: 8331
title: Enhance Neural Link Health Check Response
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-05T11:51:14Z'
updatedAt: '2026-01-05T12:16:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8331'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T12:16:07Z'
---
# Enhance Neural Link Health Check Response

The current `healthcheck` response contains a redundant `details` array and lacks specific identification for active sessions and windows.

**Goal:**
1. Remove the `details` array.
2. Enrich the response object to include:
   - `sessions`: List of active App Worker Sessions (id, connectedAt).
   - `windows`: List of connected Windows (id, appName, width, height, x, y).
   - `agents`: List of other connected Agents (ids).

**Rationale for Dimensions:**
Including basic dimensions (width/height) helps immediately distinguish between main application windows and smaller popups/dialogs without requiring an extra `get_window_topology` call, saving agent turns.

**Changes:**
- `ConnectionService.getStatus()`: Return richer window metadata.
- `HealthService.healthcheck()`: Construct the new response payload.
- `openapi.yaml`: Update `HealthCheckResponse` schema.

Reference: #8169 (Epic)

## Timeline

- 2026-01-05T11:51:15Z @tobiu added the `enhancement` label
- 2026-01-05T11:51:15Z @tobiu added the `ai` label
- 2026-01-05T11:51:15Z @tobiu added the `architecture` label
- 2026-01-05T11:51:31Z @tobiu assigned to @tobiu
- 2026-01-05T11:51:36Z @tobiu added parent issue #8169
- 2026-01-05T11:56:33Z @tobiu referenced in commit `9613d44` - "feat(ai): Enhance Neural Link health check response (#8331)

- Remove redundant 'details' array
- Add structured 'sessions', 'windows', and 'agents' lists
- Include window dimensions in 'windows' list
- Update openapi.yaml schema"
- 2026-01-05T12:16:08Z @tobiu closed this issue

