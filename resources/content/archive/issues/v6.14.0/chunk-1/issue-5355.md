---
id: 5355
title: 'main.addon.Navigator: setActiveItem() => prevent the app worker event in case the active item did not change'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-18T12:35:23Z'
updatedAt: '2024-03-18T12:37:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5355'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-18T12:37:15Z'
---
# main.addon.Navigator: setActiveItem() => prevent the app worker event in case the active item did not change

while we probably need the logic on DOM level, navigating to the same element should not notify the app worker about a change.

@ExtAnimal 

a quick changes review would be nice.

## Timeline

- 2024-03-18T12:35:24Z @tobiu added the `enhancement` label
- 2024-03-18T12:35:24Z @tobiu assigned to @tobiu
- 2024-03-18T12:36:06Z @tobiu referenced in commit `fc5c58e` - "main.addon.Navigator: setActiveItem() => prevent the app worker event in case the active item did not change #5355"
- 2024-03-18T12:37:15Z @tobiu closed this issue
- 2024-03-26T16:29:48Z @tobiu referenced in commit `1c28511` - "main.addon.Navigator: setActiveItem() => prevent the app worker event in case the active item did not change #5355"

