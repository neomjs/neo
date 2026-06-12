---
id: 2462
title: 'calendar.view.week.Component: ctor check if both stores have data'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-24T19:15:58Z'
updatedAt: '2021-06-24T19:34:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2462'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-24T19:34:24Z'
---
# calendar.view.week.Component: ctor check if both stores have data

so far it was a race condition between the calendars and event stores.

with lazy loading for the views in place, it can happen that the view module arrives after both stores got loaded already.

a simple ctor check can resolve this.

## Timeline

- 2021-06-24T19:15:58Z @tobiu added the `enhancement` label
- 2021-06-24T19:15:59Z @tobiu assigned to @tobiu
- 2021-06-24T19:33:46Z @tobiu referenced in commit `0b3f373` - "calendar.view.week.Component: ctor check if both stores have data #2462"
- 2021-06-24T19:34:24Z @tobiu closed this issue

