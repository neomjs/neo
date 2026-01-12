---
id: 7560
title: Centralize GitHub Workflow Configuration
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T23:04:20Z'
updatedAt: '2025-10-19T23:05:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7560'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T23:05:47Z'
---
# Centralize GitHub Workflow Configuration

The `HealthService` for the `github-workflow` server currently has the minimum required GitHub CLI version hardcoded as a constant. This should be moved into the shared `ai/mcp/server/config.mjs` file to centralize configuration and make it easier to manage.

## Acceptance Criteria

1.  A new `githubWorkflow` object is added to the `aiConfig` in `ai/mcp/server/config.mjs`.
2.  This new object contains a `minGhVersion` property with the value `'2.0.0'`.
3.  The `HealthService.mjs` is updated to import the `aiConfig` and use `aiConfig.githubWorkflow.minGhVersion` instead of the hardcoded `MIN_GH_VERSION` constant.
4.  The `healthcheck` tool continues to function correctly.

## Timeline

- 2025-10-19T23:04:20Z @tobiu assigned to @tobiu
- 2025-10-19T23:04:22Z @tobiu added the `enhancement` label
- 2025-10-19T23:04:22Z @tobiu added the `ai` label
- 2025-10-19T23:04:22Z @tobiu added parent issue #7536
- 2025-10-19T23:05:43Z @tobiu referenced in commit `cad5815` - "Centralize GitHub Workflow Configuration #7560"
- 2025-10-19T23:05:47Z @tobiu closed this issue

