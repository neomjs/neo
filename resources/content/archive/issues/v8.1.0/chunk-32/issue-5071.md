---
id: 5071
title: 'form.field.CheckBox: isGroupErrorTarget_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-11-02T12:27:25Z'
updatedAt: '2023-11-02T12:35:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5071'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-11-02T12:35:28Z'
---
# form.field.CheckBox: isGroupErrorTarget_ config

It should be possible to limit group errors (required) to one specific error node.

Since we can not guarantee, that it always affects the last field, we need a new config. Grouped fields could in theory live on different form pages.

## Timeline

- 2023-11-02T12:27:26Z @tobiu added the `enhancement` label
- 2023-11-02T12:27:26Z @tobiu assigned to @tobiu
### @tobiu - 2023-11-02T12:35:28Z

ha, this is already possible via: `showErrorTexts`

- 2023-11-02T12:35:28Z @tobiu closed this issue

