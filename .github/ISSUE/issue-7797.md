---
id: 7797
title: >-
  ai.mcp.server.github-workflow.services.IssueService: listIssues() uses 2 not
  imported constants
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-11-19T00:50:55Z'
updatedAt: '2025-11-19T00:50:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7797'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# ai.mcp.server.github-workflow.services.IssueService: listIssues() uses 2 not imported constants

it uses: `DEFAULT_QUERY_LIMITS` and `FETCH_ISSUES_FOR_SYNC` which do not exist inside this file (missing import).

## Activity Log

- 2025-11-19 @tobiu added the `bug` label
- 2025-11-19 @tobiu added the `ai` label

