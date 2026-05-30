---
id: 2390
title: 'vdom.Helper: update() moving a node which has a higher index sibling into a non empty node breaks'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-06-17T20:19:29Z'
updatedAt: '2021-06-17T22:15:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2390'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-17T22:15:17Z'
---
# vdom.Helper: update() moving a node which has a higher index sibling into a non empty node breaks

the very first vdom engine issue i spotted in a long time.

![Screenshot 2021-06-17 at 22 14 32](https://user-images.githubusercontent.com/1177434/122466759-00401b00-cfba-11eb-94c3-222d648be8c3.png)

moving the orange event into a non empty column breaks.

i will create a new test case for this.

## Timeline

- 2021-06-17T20:19:29Z @tobiu added the `bug` label
- 2021-06-17T20:19:29Z @tobiu assigned to @tobiu
- 2021-06-17T20:52:15Z @tobiu referenced in commit `8cee626` - "vdom.Helper: update() moving a node which has a higher index sibling into a non empty node breaks #2390"
- 2021-06-17T21:27:12Z @tobiu referenced in commit `b31ecce` - "#2390 breaking test"
- 2021-06-17T21:49:35Z @tobiu referenced in commit `cde3331` - "#2390 simplified the breaking test"
- 2021-06-17T22:02:44Z @tobiu referenced in commit `5a10f27` - "#2390 simplified the breaking test to the bare minimum"
- 2021-06-17T22:04:27Z @tobiu referenced in commit `1374f85` - "#2390 fix"
- 2021-06-17T22:15:17Z @tobiu closed this issue

