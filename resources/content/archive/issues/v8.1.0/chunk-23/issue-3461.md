---
id: 3461
title: 'button.Base: rippleEl wrapper'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-09-28T15:29:21Z'
updatedAt: '2022-09-28T16:00:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3461'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-28T16:00:29Z'
---
# button.Base: rippleEl wrapper

right now, the top level CSS selector for buttons uses `overflow: hidden`.

we need this for ripple effects, but it collides with badges, which are supposed to be positioned absolutely over a corner.

so, we need a wrapper for ripples to resolve this.

## Timeline

- 2022-09-28T15:29:21Z @tobiu added the `enhancement` label
- 2022-09-28T15:29:22Z @tobiu assigned to @tobiu
- 2022-09-28T15:44:37Z @tobiu referenced in commit `edfeba5` - "button.Base: rippleEl wrapper #3461"
- 2022-09-28T15:52:20Z @tobiu referenced in commit `2bc9420` - "#3461 removing the rippleWrapper again when needed"
- 2022-09-28T15:58:52Z @tobiu referenced in commit `44e1488` - "#3461 added z-indexes to ensure the ripple effect is "behind" the content"
- 2022-09-28T16:00:14Z @tobiu referenced in commit `6f9adc8` - "#3461 vdom cleanup"
- 2022-09-28T16:00:29Z @tobiu closed this issue

