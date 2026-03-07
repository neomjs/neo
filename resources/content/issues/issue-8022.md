---
id: 8022
title: 'Refactor AgentOS Viewport: Modularize Components'
state: OPEN
labels:
  - enhancement
  - stale
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-04T03:36:24Z'
updatedAt: '2026-03-05T03:38:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8022'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor AgentOS Viewport: Modularize Components

The `Viewport.mjs` file is becoming overloaded. Refactor the `items` (Toolbar, Dashboard, Panels) into their own dedicated component files (e.g., `view/main/Toolbar.mjs`, `view/dashboard/Panel.mjs`). This promotes separation of concerns and cleaner code.

## Timeline

- 2025-12-04T03:36:26Z @tobiu added the `enhancement` label
- 2025-12-04T03:36:26Z @tobiu added the `ai` label
- 2025-12-04T03:36:26Z @tobiu added the `refactoring` label
- 2025-12-04T03:36:26Z @tobiu added the `architecture` label
- 2025-12-04T03:45:20Z @tobiu added parent issue #7918
- 2025-12-04T22:41:16Z @tobiu assigned to @tobiu
### @github-actions - 2026-03-05T03:38:51Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-05T03:38:51Z @github-actions added the `stale` label

