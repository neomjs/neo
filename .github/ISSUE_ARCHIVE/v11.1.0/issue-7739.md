---
id: 7739
title: 'ai.mcp.server.github-workflow.services.HealthService: use the semver lib'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - MannXo
createdAt: '2025-11-11T08:39:08Z'
updatedAt: '2025-11-11T09:23:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7739'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T09:23:57Z'
---
# ai.mcp.server.github-workflow.services.HealthService: use the semver lib

`HealthService` is already importing `semver` in line 6, so we should use it, and either remove `parseVersionOutput` or use it inside the method.

Rationale: semver handles edge cases like `v11.0.0-alpha.2` well.

## Comments

### @MannXo - 2025-11-11 08:46

Hey @tobiu . As you mentioned, this is a follow-up ticket on HealthService and Im happy to work on it.

## Activity Log

- 2025-11-11 @tobiu added the `enhancement` label
- 2025-11-11 @tobiu added the `ai` label
- 2025-11-11 @tobiu cross-referenced by PR #7738
- 2025-11-11 @tobiu assigned to @MannXo
- 2025-11-11 @MannXo cross-referenced by PR #7740
- 2025-11-11 @tobiu closed this issue

