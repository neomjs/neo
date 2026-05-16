---
id: 2446
title: 'calendar.view.week.EventDragZone: add the event overflow logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-22T18:18:31Z'
updatedAt: '2021-06-24T12:30:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2446'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-24T12:30:42Z'
---
# calendar.view.week.EventDragZone: add the event overflow logic

this one is complicated, since we need 2 different versions of the overflow styling:
1. one cell, no visual end time
2. two cells in case the end time is shown

since `has()` css selectors are not available yet, we need to add a second css selector to apply different stylings.

## Timeline

- 2021-06-22T18:18:31Z @tobiu added the `enhancement` label
- 2021-06-22T18:18:32Z @tobiu assigned to @tobiu
- 2021-06-22T18:19:12Z @tobiu referenced in commit `1f288e2` - "#2446 in progress"
- 2021-06-23T15:42:34Z @tobiu referenced in commit `0ce37cb` - "#2446 enhanced styling"
### @tobiu - 2021-06-24T12:30:42Z

If the height is too little, the title moves into the first “row”
![Screenshot 2021-06-23 at 17 43 37](https://user-images.githubusercontent.com/1177434/123262941-bba40a80-d4f8-11eb-850e-22d922bc005e.png)


it gets more tricky in case we show end times:
![Screenshot 2021-06-23 at 17 43 06](https://user-images.githubusercontent.com/1177434/123262546-4801fd80-d4f8-11eb-9d0e-5a7575d57b6b.png)


In case height is “one row”, move the title to the top as well
and do not show the end time at all (otherwise the title is too short)
for a height of “two rows”: keep the title inside the first row, the end time inside the next row:
![Screenshot 2021-06-23 at 17 43 22](https://user-images.githubusercontent.com/1177434/123262625-5c45fa80-d4f8-11eb-907d-4df69cf4d3a0.png)

- 2021-06-24T12:30:42Z @tobiu closed this issue

