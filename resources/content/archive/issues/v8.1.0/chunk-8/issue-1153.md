---
id: 1153
title: 'plugin.Resizable: add a map for [t, l, r] => [n, w, e]'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-31T14:54:06Z'
updatedAt: '2020-08-31T14:57:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1153'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-31T14:57:08Z'
---
# plugin.Resizable: add a map for [t, l, r] => [n, w, e]

we are using top, left, right etc. for position values of the resize handles.

the default cursor positions use north, west, east etc.

so we need a mapping, in case we want to ensure the mouse cursor stays the same while dragging.

## Timeline

- 2020-08-31T14:54:06Z @tobiu added the `enhancement` label
- 2020-08-31T14:54:06Z @tobiu assigned to @tobiu
- 2020-08-31T14:57:05Z @tobiu referenced in commit `1f4b39e` - "plugin.Resizable: add a map for [t, l, r] => [n, w, e] #1153"
- 2020-08-31T14:57:08Z @tobiu closed this issue

