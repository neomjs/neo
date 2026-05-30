---
id: 3516
title: 'tab.Container: double-clicking on tab headers multiple times can trigger a drag OP'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-04T14:51:15Z'
updatedAt: '2022-10-04T15:50:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3516'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-04T15:50:19Z'
---
# tab.Container: double-clicking on tab headers multiple times can trigger a drag OP

this results in `tab.header.Button` not getting displayed again:
<img width="543" alt="Screenshot 2022-10-04 at 16 45 28" src="https://user-images.githubusercontent.com/1177434/193851799-07988d73-0f52-4dde-a8c6-758ea7ae83e5.png">

we either need to ensure that a drag OP starts "later" or that drag gets disabled for a short period after drop.

## Timeline

- 2022-10-04T14:51:15Z @tobiu added the `bug` label
- 2022-10-04T14:51:16Z @tobiu assigned to @tobiu
- 2022-10-04T15:48:27Z @tobiu referenced in commit `6a6ad0d` - "tab.Container: double-clicking on tab headers multiple times can trigger a drag OP #3516"
### @tobiu - 2022-10-04T15:50:19Z

i did some intense monkey-testing and this should neo longer happen.

the mouse sensor now uses a delay of 0.1s as well as a min distance of 5px. drag start might feel a little bit delayed now.

i also adjusted the timeouts to ensure that an initial hide OP can no longer happen after the re-show.

- 2022-10-04T15:50:19Z @tobiu closed this issue

