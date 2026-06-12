---
id: 6827
title: 'main.DeltaUpdates: createDomTree() => enhanced logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-17T11:15:42Z'
updatedAt: '2025-06-17T11:16:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6827'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-17T11:16:07Z'
---
# main.DeltaUpdates: createDomTree() => enhanced logic

* build a detached DOM tree, once done, directly inject it into the live DOM
* since we are just adding one finished tree after detached construction, we can skip using a fragment
* exception: vtype text => fragment since 3 nodes
* the method should handle the live dom insertion on its own.

## Timeline

- 2025-06-17T11:15:42Z @tobiu assigned to @tobiu
- 2025-06-17T11:15:43Z @tobiu added the `enhancement` label
- 2025-06-17T11:16:02Z @tobiu referenced in commit `76fe8f7` - "main.DeltaUpdates: createDomTree() => enhanced logic #6827"
- 2025-06-17T11:16:07Z @tobiu closed this issue

