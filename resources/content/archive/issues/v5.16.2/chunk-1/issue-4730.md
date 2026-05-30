---
id: 4730
title: 'form.field.Switch: labelPosition top is not supported inside the scss file'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-15T15:56:41Z'
updatedAt: '2023-08-15T16:27:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4730'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-15T16:27:46Z'
---
# form.field.Switch: labelPosition top is not supported inside the scss file

*(No description provided)*

## Timeline

- 2023-08-15T15:56:41Z @tobiu added the `bug` label
- 2023-08-15T15:56:41Z @tobiu assigned to @tobiu
- 2023-08-15T16:26:17Z @tobiu referenced in commit `b462d87` - "form.field.Switch: labelPosition top is not supported inside the scss file #4730"
### @tobiu - 2023-08-15T16:27:32Z

change of strategy: @ki1pen @dztoprak @Dinkh

the field is now using the `neo-checkboxfield` baseCls as well (plus the new one). a lot easier to maintain.

- 2023-08-15T16:27:46Z @tobiu closed this issue

