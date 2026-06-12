---
id: 5910
title: 7.3.0  examples/grid/container  all highlighting fails
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-09-15T17:34:41Z'
updatedAt: '2024-09-15T19:23:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5910'
author: gplanansky
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T19:23:59Z'
---
# 7.3.0  examples/grid/container  all highlighting fails

**Describe the bug**
dev 7.3.0  examples/grid/container  all highlighting fails
rows focus on mouse, but mouse clicks do not highlight in any selection mode

This works in on my 6.10.10 install.

**To Reproduce**
git clone, etc
npm run server-start
chrome -->  examples/grid/container

**Expected behavior**
highlighting per various selection modes works

**Desktop (please complete the following information):**
 - OS: macos
 - Browser: Version 128.0.6613.138 (Official Build) (arm64)


## Timeline

- 2024-09-15T17:34:41Z @gplanansky added the `bug` label
### @gplanansky - 2024-09-15T17:51:14Z

ditto for examples/table/container

### @tobiu - 2024-09-15T18:18:47Z

let's break this one up into smaller tickets.

### @tobiu - 2024-09-15T19:23:59Z

resolved via the tickets 5911 to 5924.

i wanted to add the new listeners to the selection models anyway ;)

the grid is still experimental, i would not recommend using it before the buffered rendering is in place. @rwaters 

be aware that the event signature changed a bit for the rowClick & cellClick events => data contains new top level infos (e.g. record & field), the original received event is passed inside `data.data`.

- 2024-09-15T19:23:59Z @tobiu closed this issue

