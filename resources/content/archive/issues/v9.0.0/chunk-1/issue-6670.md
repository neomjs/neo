---
id: 6670
title: 'main.DomEvents: getTargetData() => enhance the tabIndex getter'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-17T11:16:37Z'
updatedAt: '2025-04-17T11:17:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6670'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-17T11:17:22Z'
---
# main.DomEvents: getTargetData() => enhance the tabIndex getter

* `node.tabIndex` returns -1, in case a node does not have a `tabindex` attribute at all.
* This is not helpful to distinguish between real -1 values and null.

## Timeline

- 2025-04-17T11:16:37Z @tobiu added the `enhancement` label
- 2025-04-17T11:16:37Z @tobiu assigned to @tobiu
- 2025-04-17T11:17:16Z @tobiu referenced in commit `930a86c` - "main.DomEvents: getTargetData() => enhance the tabIndex getter #6670"
- 2025-04-17T11:17:22Z @tobiu closed this issue

