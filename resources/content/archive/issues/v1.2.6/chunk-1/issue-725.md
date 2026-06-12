---
id: 725
title: 'SharedCovid App: sizing inside non main windows'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-14T17:23:56Z'
updatedAt: '2020-06-14T17:46:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/725'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-14T17:46:04Z'
---
# SharedCovid App: sizing inside non main windows

for some reason, the line chart & table components to not get the correct height.

the chart has a height of 0, making it invisible.

the table does not scroll vertically.

looking into this now.

## Timeline

- 2020-06-14T17:23:56Z @tobiu added the `enhancement` label
- 2020-06-14T17:23:56Z @tobiu assigned to @tobiu
- 2020-06-14T17:45:27Z @tobiu referenced in commit `5aa766f` - "SharedCovid App: sizing inside non main windows #725"
### @tobiu - 2020-06-14T17:46:04Z

container.Viewport was not passing the appName config, so a body cls was not getting applied

- 2020-06-14T17:46:04Z @tobiu closed this issue

