---
id: 3423
title: 'buildScripts/createApp: MainContainer => comments'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-09-03T08:48:53Z'
updatedAt: '2022-09-03T08:53:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3423'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-03T08:53:43Z'
---
# buildScripts/createApp: MainContainer => comments

the app generator creates **block** comments like
```
/*
 * @member {String} className='ViewModels.view.MainContainer'
 * @protected
 */
```

instead of **doc** comments:
```
/**
 * @member {String} className='ViewModels.view.MainContainer'
 * @protected
 */
```

this can cause issues with the `create-class` program.

## Timeline

- 2022-09-03T08:48:53Z @tobiu added the `bug` label
- 2022-09-03T08:48:53Z @tobiu assigned to @tobiu
- 2022-09-03T08:51:21Z @tobiu referenced in commit `64e3fae` - "buildScripts/createApp: MainContainer => comments #3423"
- 2022-09-03T08:53:43Z @tobiu closed this issue
- 2022-09-03T08:56:27Z @tobiu cross-referenced by #3424

