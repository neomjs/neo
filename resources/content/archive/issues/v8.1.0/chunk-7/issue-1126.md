---
id: 1126
title: 'form.field.Base: readOnly_ config'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-08-22T11:54:00Z'
updatedAt: '2023-01-05T11:49:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1126'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-05T11:49:44Z'
---
# form.field.Base: readOnly_ config

similar to disabled_ for component.Base.

add / remove a neo-readonly cls to the vdomRoot.

using afterSetReadOnly()

scss => pointer-events: none should probably be enoug., we need to double-check, if you can still tab into fields in this case.

## Timeline

- 2020-08-22T11:54:00Z @tobiu added the `enhancement` label
### @tobiu - 2023-01-05T10:06:00Z

working on this one now. we should apply the DOM attribute as well (then we don't need to add pointer-events: none). plus some css vars

- 2023-01-05T10:08:12Z @tobiu referenced in commit `e98908e` - "form.field.Base: readOnly_ config #1126"
- 2023-01-05T10:10:47Z @tobiu referenced in commit `ff4c5b7` - "#1126 examples.form.field.text.MainContainer: readOnly checkbox"
- 2023-01-05T11:28:22Z @tobiu referenced in commit `a2adcb9` - "#1126 light theme & src: readOnly styling"
- 2023-01-05T11:32:28Z @tobiu referenced in commit `44f58ed` - "#1126 dark theme: readOnly styling"
- 2023-01-05T11:49:44Z @tobiu closed this issue

