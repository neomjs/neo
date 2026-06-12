---
id: 3299
title: 'controller.Base: construct() => trigger a first `onHashChange()` if needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-07-18T11:56:40Z'
updatedAt: '2022-07-18T16:06:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3299'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-18T16:06:08Z'
---
# controller.Base: construct() => trigger a first `onHashChange()` if needed

with the ability to lazy load controllers and view controllers, it is quite likely that a controller gets imported after a first route has been set.

so, triggering `onHashChange()` in case there is a last route stored inside the history (`util.HashHistory`) can simplify our lives a bit.

## Timeline

- 2022-07-18T11:56:40Z @tobiu added the `enhancement` label
- 2022-07-18T11:56:40Z @tobiu assigned to @tobiu
- 2022-07-18T16:05:03Z @tobiu referenced in commit `90ca4cd` - "controller.Base: construct() => trigger a first onHashChange() if needed #3299"
- 2022-07-18T16:06:08Z @tobiu closed this issue

