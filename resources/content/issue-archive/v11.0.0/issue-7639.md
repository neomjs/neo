---
id: 7639
title: 'Chore: Improve `create_issue` tool to enforce proposal workflow'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T09:14:41Z'
updatedAt: '2025-10-25T09:25:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7639'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-25T09:25:03Z'
---
# Chore: Improve `create_issue` tool to enforce proposal workflow

To improve the agent's workflow and prevent errors like forgetting labels, the `create_issue` tool's description in the OpenAPI spec should be updated. The new description should instruct the agent to always propose the issue's `title`, `body`, and `labels` to the user for approval *before* calling the tool. This ensures user alignment and completeness before the issue is created on GitHub.

## Timeline

- 2025-10-25T09:23:40Z @tobiu assigned to @tobiu
- 2025-10-25T09:24:07Z @tobiu added the `documentation` label
- 2025-10-25T09:24:07Z @tobiu added the `enhancement` label
- 2025-10-25T09:24:07Z @tobiu added the `ai` label
- 2025-10-25T09:24:38Z @tobiu referenced in commit `32ba7b0` - "Chore: Improve create_issue tool to enforce proposal workflow #7639"
- 2025-10-25T09:25:03Z @tobiu closed this issue

