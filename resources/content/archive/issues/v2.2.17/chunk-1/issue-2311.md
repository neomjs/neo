---
id: 2311
title: 'calendar.view.week.EventDragZone: drop() can result entering a different day, depending on the time zone'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-07T08:39:12Z'
updatedAt: '2021-06-07T08:39:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2311'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-07T08:39:41Z'
---
# calendar.view.week.EventDragZone: drop() can result entering a different day, depending on the time zone

If i switch my time zone to Canada and use `new Date(‘2021-07-22’)`, I get:

`Wed Jul 21 2021 18:00:00 GMT-0600 (Central Standard Time)`

which is 1 day off (21 instead of 22).

we need to pass `00:00:00`.

## Timeline

- 2021-06-07T08:39:12Z @tobiu added the `enhancement` label
- 2021-06-07T08:39:12Z @tobiu assigned to @tobiu
- 2021-06-07T08:39:38Z @tobiu referenced in commit `d98bf58` - "calendar.view.week.EventDragZone: drop() can result entering a different day, depending on the time zone #2311"
- 2021-06-07T08:39:41Z @tobiu closed this issue

