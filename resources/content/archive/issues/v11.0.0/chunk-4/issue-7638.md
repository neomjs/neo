---
id: 7638
title: 'Feat: Add startup summarization status to healthcheck'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T09:01:34Z'
updatedAt: '2025-10-25T09:05:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7638'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-25T09:05:56Z'
---
# Feat: Add startup summarization status to healthcheck

The `healthcheck` endpoint has been enhanced to provide visibility into the status of the asynchronous session summarization task that runs at server startup. This allows an agent to know whether the summarization was completed, failed, or skipped, and to take appropriate action.

**Changes:**
1.  **`HealthService` Enhancement:**
    -   The `HealthService` now tracks the status (`completed`, `failed`, `skipped`, `not_attempted`) and details of the startup summarization.
    -   A new `recordStartupSummarization()` method was added to allow the main startup process to report the outcome.

2.  **Startup Process Integration:**
    -   The `mcp-stdio.mjs` startup sequence now reports the success, failure, or skipping of the summarization task to the `HealthService`.

3.  **API Specification Update:**
    -   The `openapi.yaml` has been updated. The `HealthCheckResponse` schema now includes a `startup` object containing `summarizationStatus` and `summarizationDetails`.

## Timeline

- 2025-10-25T09:04:23Z @tobiu assigned to @tobiu
- 2025-10-25T09:04:32Z @tobiu added the `enhancement` label
- 2025-10-25T09:04:32Z @tobiu added the `ai` label
- 2025-10-25T09:05:10Z @tobiu referenced in commit `e88fe06` - "Feat: Add startup summarization status to healthcheck #7638"
- 2025-10-25T09:05:56Z @tobiu closed this issue

