---
id: 5127
title: 'tab.Strip: moveActiveIndicator() => honor the scroll state inside the page'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-12-04T13:00:58Z'
updatedAt: '2023-12-04T13:02:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5127'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-04T13:02:20Z'
---
# tab.Strip: moveActiveIndicator() => honor the scroll state inside the page

Right now, when we have a TabContainer which is scrolled inside any parent container, the animations inside the tab strip do not honor this.

As a solution: the tab.Strip needs `position: relative`, and this change has to get honored inside the positioning logic (for the new left & top positions, we have to subtract the tab.Strip edge from the domRect positions).

## Timeline

- 2023-12-04T13:00:58Z @tobiu added the `enhancement` label
- 2023-12-04T13:00:58Z @tobiu assigned to @tobiu
- 2023-12-04T13:02:15Z @tobiu referenced in commit `f5e7f30` - "tab.Strip: moveActiveIndicator() => honor the scroll state inside the page #5127"
- 2023-12-04T13:02:20Z @tobiu closed this issue

