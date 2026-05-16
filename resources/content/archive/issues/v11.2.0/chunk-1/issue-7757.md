---
id: 7757
title: Optimize GraphQL responses for `ADD_BLOCKED_BY` and `REMOVE_BLOCKED_BY` mutations
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-12T14:18:13Z'
updatedAt: '2025-11-12T21:15:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7757'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-12T21:15:11Z'
---
# Optimize GraphQL responses for `ADD_BLOCKED_BY` and `REMOVE_BLOCKED_BY` mutations

The current GraphQL mutations for `ADD_BLOCKED_BY` and `REMOVE_BLOCKED_BY` in `ai/mcp/server/github-workflow/services/queries/mutations.mjs` fetch up to 100 child issues in their responses. This can be overly expensive and is likely unnecessary for the immediate confirmation of the mutation. The responses should be optimized to fetch only the essential information needed to confirm the success of the operation, such as the issue numbers involved.

## Timeline

- 2025-11-12T14:18:14Z @tobiu added the `bug` label
- 2025-11-12T14:18:14Z @tobiu added the `ai` label
- 2025-11-12T14:22:13Z @tobiu cross-referenced by PR #7753
- 2025-11-12T21:14:20Z @tobiu assigned to @tobiu
- 2025-11-12T21:15:05Z @tobiu referenced in commit `ad67e12` - "Optimize GraphQL responses for ADD_BLOCKED_BY and REMOVE_BLOCKED_BY mutations #7757"
- 2025-11-12T21:15:11Z @tobiu closed this issue

