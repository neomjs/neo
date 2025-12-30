---
id: 8223
title: Investigate and Fix get_component_tree Timeout
state: OPEN
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2025-12-30T18:48:56Z'
updatedAt: '2025-12-30T18:49:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8223'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate and Fix get_component_tree Timeout

During testing of the Neural Link capabilities, the `get_component_tree` tool consistently timed out (30s limit) when querying an active App Worker session (`2aad7032-5222-4817-90d5-8e7fa7539eca`).

**Tasks:**
1.  Investigate why the request is timing out.
    *   Is the message reaching the App Worker?
    *   Is the App Worker failing to serialize the tree?
    *   Is the response getting lost in the bridge?
2.  Optimize the serialization performance if necessary.
3.  Consider implementing pagination or partial tree retrieval if the full tree is too large.
4.  Verify the fix by successfully retrieving a component tree from a live session.

## Activity Log

- 2025-12-30 @tobiu added the `bug` label
- 2025-12-30 @tobiu added the `ai` label
- 2025-12-30 @tobiu added the `performance` label
- 2025-12-30 @tobiu assigned to @tobiu
- 2025-12-30 @tobiu added parent issue #8169

