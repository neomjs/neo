---
id: 2622
title: 'button.Base: type button attribute'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-17T17:50:36Z'
updatedAt: '2021-07-17T17:50:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2622'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-17T17:50:54Z'
---
# button.Base: type button attribute

I just noticed that hitting enter inside the `Neo.calendar.view.EditEventContainer` form container title field triggered the action of the delete button.

Buttons are not supposed to submit forms on their own, so adding a `type="button"` dom attribute feels like a reasonable fix.

## Timeline

- 2021-07-17T17:50:36Z @tobiu added the `enhancement` label
- 2021-07-17T17:50:36Z @tobiu assigned to @tobiu
- 2021-07-17T17:50:52Z @tobiu referenced in commit `e08ae22` - "button.Base: type button attribute #2622"
- 2021-07-17T17:50:55Z @tobiu closed this issue

