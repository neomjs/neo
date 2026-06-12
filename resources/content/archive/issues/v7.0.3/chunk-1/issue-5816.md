---
id: 5816
title: 'component.Base: afterSetAppName() => afterSetWindowId()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-21T20:12:16Z'
updatedAt: '2024-08-21T20:48:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5816'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-21T20:48:41Z'
---
# component.Base: afterSetAppName() => afterSetWindowId()

```
    afterSetAppName(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.windowId, this.__proto__)
    }
```

the logic outdates `windowId` and should get switched.

## Timeline

- 2024-08-21T20:12:16Z @tobiu added the `enhancement` label
- 2024-08-21T20:14:31Z @tobiu assigned to @tobiu
- 2024-08-21T20:40:30Z @tobiu referenced in commit `d45ce8b` - "component.Base: afterSetAppName() => afterSetWindowId() #5816"
- 2024-08-21T20:41:13Z @tobiu closed this issue
- 2024-08-21T20:43:27Z @tobiu reopened this issue
- 2024-08-21T20:43:51Z @tobiu referenced in commit `7db2384` - "#5816 toolbar config name fix"
- 2024-08-21T20:48:39Z @tobiu referenced in commit `a496460` - "#5816 missing windowId fixes"
- 2024-08-21T20:48:41Z @tobiu closed this issue

