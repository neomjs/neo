---
id: 2461
title: 'calendar.view.YearComponent: ctor check if both stores have data'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-24T19:11:16Z'
updatedAt: '2021-06-24T19:14:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2461'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-24T19:14:54Z'
---
# calendar.view.YearComponent: ctor check if both stores have data

so far it was a race condition between the calendars and event stores.

with lazy loading for the views in place, it can happen that the view module arrives after both stores got loaded already.

a simple ctor check can resolve this.

## Timeline

- 2021-06-24T19:11:16Z @tobiu added the `enhancement` label
- 2021-06-24T19:11:16Z @tobiu assigned to @tobiu
- 2021-06-24T19:14:13Z @tobiu referenced in commit `34b04a5` - "calendar.view.YearComponent: ctor check if both stores have data #2461"
- 2021-06-24T19:14:54Z @tobiu closed this issue

