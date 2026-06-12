---
id: 6598
title: 'calendar.view.week.plugin.EventResizable: onMouseMove() => simplify the check condition'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-03-30T18:46:17Z'
updatedAt: '2025-03-30T18:47:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6598'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-30T18:47:10Z'
---
# calendar.view.week.plugin.EventResizable: onMouseMove() => simplify the check condition

```
if (this.owner.data.events.enableDrag) {
```

is actually expensive, since it will trigger `getHierarchyData()` inside `state.Provider`. We have the config mapped into `calendar.view.week.Component`, so a direct check makes sense.

related to: https://github.com/neomjs/neo/issues/6597

## Timeline

- 2025-03-30T18:46:17Z @tobiu added the `enhancement` label
- 2025-03-30T18:47:04Z @tobiu referenced in commit `d7b47de` - "calendar.view.week.plugin.EventResizable: onMouseMove() => simplify the check condition #6598"
- 2025-03-30T18:47:10Z @tobiu closed this issue

