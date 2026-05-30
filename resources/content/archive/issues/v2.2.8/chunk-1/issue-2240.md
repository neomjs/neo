---
id: 2240
title: Add CSS classes for important cursor styles
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-02T23:00:37Z'
updatedAt: '2021-06-03T10:43:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2240'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-03T10:43:41Z'
---
# Add CSS classes for important cursor styles

best into the global file.

e.g. setting a mouse cursor style with !important does not override child node cursors without using the important flag, so we need a * selector.

use case: drag& drop where the cursor can leave the dragEl or proxy.

## Timeline

- 2021-06-02T23:00:37Z @tobiu added the `enhancement` label
- 2021-06-02T23:00:37Z @tobiu assigned to @tobiu
- 2021-06-03T09:18:33Z @tobiu referenced in commit `b2bd136` - "Add CSS classes for important cursor styles #2240 => PoC"
- 2021-06-03T10:43:30Z @tobiu referenced in commit `696137d` - "Add CSS classes for important cursor styles #2240"
- 2021-06-03T10:43:41Z @tobiu closed this issue

