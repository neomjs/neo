---
id: 7750
title: Refactor `addSubIssue` and `removeSubIssue` Mutations for Efficiency
state: CLOSED
labels:
  - enhancement
  - good first issue
  - ai
assignees: []
createdAt: '2025-11-12T07:59:51Z'
updatedAt: '2025-11-12T14:27:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7750'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-12T14:27:19Z'
---
# Refactor `addSubIssue` and `removeSubIssue` Mutations for Efficiency

The `ADD_SUB_ISSUE` and `REMOVE_SUB_ISSUE` GraphQL mutations, introduced in PR #7741, currently fetch the parent issue's complete list of sub-issues (`first: 100`) in their return payload. This is unnecessary and inefficient for an operation that only modifies a single relationship.

**Acceptance Criteria:**
1.  Modify the `ADD_SUB_ISSUE` and `REMOVE_SUB_ISSUE` mutations in `mutations.mjs`.
2.  The return payload of these mutations should be minimal, confirming only the parent and the specific child issue that was added or removed.
3.  The `subIssues` field should be removed from the mutation's response to reduce the payload size and improve performance.

## Timeline

- 2025-11-12T07:59:52Z @tobiu added the `enhancement` label
- 2025-11-12T07:59:52Z @tobiu added the `good first issue` label
- 2025-11-12T07:59:53Z @tobiu added the `ai` label
- 2025-11-12T08:14:45Z @tobiu cross-referenced by PR #7741
- 2025-11-12T10:26:45Z @MannXo cross-referenced by PR #7754
- 2025-11-12T14:27:19Z @tobiu closed this issue

