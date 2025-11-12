---
id: 7757
title: >-
  Optimize GraphQL responses for `ADD_BLOCKED_BY` and `REMOVE_BLOCKED_BY`
  mutations
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-11-12T14:18:13Z'
updatedAt: '2025-11-12T14:18:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7757'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Optimize GraphQL responses for `ADD_BLOCKED_BY` and `REMOVE_BLOCKED_BY` mutations

**Reported by:** @tobiu on 2025-11-12

The current GraphQL mutations for `ADD_BLOCKED_BY` and `REMOVE_BLOCKED_BY` in `ai/mcp/server/github-workflow/services/queries/mutations.mjs` fetch up to 100 child issues in their responses. This can be overly expensive and is likely unnecessary for the immediate confirmation of the mutation. The responses should be optimized to fetch only the essential information needed to confirm the success of the operation, such as the issue numbers involved.

