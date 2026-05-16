---
id: 5119
title: 'component.Base: afterSetIsLoading() => ensure that the logic won''t trigger for initial false states'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-12-01T11:11:08Z'
updatedAt: '2023-12-01T11:11:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5119'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-01T11:11:51Z'
---
# component.Base: afterSetIsLoading() => ensure that the logic won't trigger for initial false states

this breaks a lot of other items otherwise (e.g. buttons no longer getting an ui, labelPositions for fields).

it also triggers not needed logic for most cmp ctors

## Timeline

- 2023-12-01T11:11:08Z @tobiu added the `bug` label
- 2023-12-01T11:11:09Z @tobiu assigned to @tobiu
- 2023-12-01T11:11:40Z @tobiu referenced in commit `23fb51d` - "component.Base: afterSetIsLoading() => ensure that the logic won't trigger for initial false states #5119"
- 2023-12-01T11:11:46Z @tobiu changed title from **component.Base: afterSetIsLoading() => ensure that the logic won't trigger for inital false states** to **component.Base: afterSetIsLoading() => ensure that the logic won't trigger for initial false states**
- 2023-12-01T11:11:51Z @tobiu closed this issue

