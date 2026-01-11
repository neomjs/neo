---
id: 7525
title: Enhance Memory Core Health Check
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:06:13Z'
updatedAt: '2025-10-17T12:12:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7525'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-17T12:12:06Z'
---
# Enhance Memory Core Health Check

This ticket is to improve the `healthcheck` tool for the `memory-core` server to match the more comprehensive implementation of the `knowledge-base` server. This involves updating the `healthService.mjs` to check for the existence and status of both the `memories` and `summaries` collections, and updating the `openapi.yaml` to reflect the richer response schema.

## Acceptance Criteria

1.  The `buildHealthResponse` function in `ai/mcp/server/memory-core/services/healthService.mjs` is updated.
2.  The health check now verifies the existence and document count of both the `memories` and `summaries` collections.
3.  The `HealthCheckResponse` schema in `ai/mcp/server/memory-core/openapi.yaml` is updated to include the detailed database and collection status, matching the structure of the knowledge-base server's schema.
4.  A successful health check call returns the new, richer status object.

## Timeline

- 2025-10-17T12:06:14Z @tobiu assigned to @tobiu
- 2025-10-17T12:06:15Z @tobiu added the `enhancement` label
- 2025-10-17T12:06:15Z @tobiu added the `ai` label
- 2025-10-17T12:06:15Z @tobiu added parent issue #7520
- 2025-10-17T12:10:36Z @tobiu referenced in commit `4d2db48` - "Enhance Memory Core Health Check #7525"
- 2025-10-17T12:12:06Z @tobiu closed this issue

