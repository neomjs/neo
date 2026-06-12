---
id: 2460
title: 'calendar.view.month.Component: ctor check if both stores have data'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-24T19:05:16Z'
updatedAt: '2021-06-24T19:09:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2460'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-24T19:09:27Z'
---
# calendar.view.month.Component: ctor check if both stores have data

so far it was a race condition between the calendars and event stores.

with lazy loading for the views in place, it can happen that the view module arrives after both stores got loaded already.

a simple ctor check can resolve this.

## Timeline

- 2021-06-24T19:05:16Z @tobiu added the `enhancement` label
- 2021-06-24T19:05:17Z @tobiu assigned to @tobiu
- 2021-06-24T19:09:17Z @tobiu referenced in commit `c329050` - "calendar.view.month.Component: ctor check if both stores have data #2460"
- 2021-06-24T19:09:27Z @tobiu closed this issue

