---
id: 3989
title: 'form.field.Picker: destroying or unmounting the field should destroy or hide the picker component'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-06T09:46:18Z'
updatedAt: '2023-02-06T09:52:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3989'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-06T09:52:12Z'
---
# form.field.Picker: destroying or unmounting the field should destroy or hide the picker component

*(No description provided)*

## Timeline

- 2023-02-06T09:46:18Z @tobiu added the `bug` label
- 2023-02-06T09:46:18Z @tobiu assigned to @tobiu
- 2023-02-06T09:51:10Z @tobiu referenced in commit `fff2e68` - "form.field.Picker: destroying or unmounting the field should hide or destroy the picker component #3989"
- 2023-02-06T09:51:36Z @tobiu changed title from **form.field.Picker: destroying or unmounting the field should hide or destroy the picker component** to **form.field.Picker: destroying or unmounting the field should destroy or hide the picker component**
### @tobiu - 2023-02-06T09:52:12Z

* destroy field => destroy picker in case it exists
* unmount => hide picker, in case it exists

- 2023-02-06T09:52:12Z @tobiu closed this issue

