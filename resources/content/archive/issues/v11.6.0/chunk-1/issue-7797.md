---
id: 7797
title: 'ai.mcp.server.github-workflow.services.IssueService: listIssues() uses 2 not imported constants'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-19T00:50:55Z'
updatedAt: '2025-11-19T09:54:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7797'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T09:54:38Z'
---
# ai.mcp.server.github-workflow.services.IssueService: listIssues() uses 2 not imported constants

it uses: `DEFAULT_QUERY_LIMITS` and `FETCH_ISSUES_FOR_SYNC` which do not exist inside this file (missing import).

## Timeline

- 2025-11-19T00:50:56Z @tobiu added the `bug` label
- 2025-11-19T00:50:56Z @tobiu added the `ai` label
- 2025-11-19T09:52:04Z @tobiu assigned to @tobiu
- 2025-11-19T09:54:27Z @tobiu referenced in commit `770e821` - "ai.mcp.server.github-workflow.services.IssueService: listIssues() uses 2 not imported constants #7797"
- 2025-11-19T09:54:38Z @tobiu closed this issue

