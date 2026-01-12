---
id: 8106
title: Fix StrategyPanel main header color mismatch
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-13T15:17:20Z'
updatedAt: '2025-12-13T15:22:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8106'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T15:22:55Z'
---
# Fix StrategyPanel main header color mismatch

The main header text of the `StrategyPanel` ("Strategy Dashboard") is currently rendering in the default cyan color instead of the intended golden (`--agent-accent-strategy`). The existing SCSS only applies the golden color to the inner KPI card headers (`.agent-kpi-card-panel`). This task will add a style rule to ensure the main header is also styled correctly.

## Timeline

- 2025-12-13T15:17:22Z @tobiu added the `bug` label
- 2025-12-13T15:17:22Z @tobiu added the `design` label
- 2025-12-13T15:17:22Z @tobiu added the `ai` label
- 2025-12-13T15:20:41Z @tobiu assigned to @tobiu
- 2025-12-13T15:21:06Z @tobiu referenced in commit `1799a81` - "Fix StrategyPanel main header color mismatch #8106"
- 2025-12-13T15:22:55Z @tobiu closed this issue

