---
id: 3144
title: 'component.Base: afterSetHidden()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-06-09T09:35:41Z'
updatedAt: '2022-06-09T09:38:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3144'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-09T09:38:49Z'
---
# component.Base: afterSetHidden()

the method triggers `hide()` or `show()` when initially setting the value.

the result is, that every component root node gets the style `visibility: 'visible'` applied and this causes serious side-effects.

e.g. inside the covid app, the charts no longer have the full height.

@Dinkh 

## Timeline

- 2022-06-09T09:35:41Z @tobiu added the `bug` label
- 2022-06-09T09:35:42Z @tobiu assigned to @tobiu
- 2022-06-09T09:38:38Z @tobiu referenced in commit `ba9fbfb` - "component.Base: afterSetHidden() #3144"
- 2022-06-09T09:38:49Z @tobiu closed this issue

