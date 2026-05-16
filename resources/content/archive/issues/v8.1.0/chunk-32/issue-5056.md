---
id: 5056
title: 'form.field.Picker: adjust pickerIsMounted'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-10-25T15:50:30Z'
updatedAt: '2023-10-25T19:09:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5056'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-25T19:09:39Z'
---
# form.field.Picker: adjust pickerIsMounted

the config is still in use inside several spots, but the custom show & hide logic got removed.

we should populate the value again or remove it.

## Timeline

- 2023-10-25T15:50:30Z @tobiu added the `bug` label
- 2023-10-25T15:50:30Z @tobiu assigned to @tobiu
- 2023-10-25T19:09:38Z @tobiu referenced in commit `801b132` - "form.field.Picker: adjust pickerIsMounted #5056"
- 2023-10-25T19:09:40Z @tobiu closed this issue
- 2023-10-30T16:15:51Z @tobiu referenced in commit `d52eeec` - "v6.9.4 (#5059)

* tab.header.Button: ARIA roles #5054 => role, aria-selected

* form.field.Picker: adjust pickerIsMounted #5056

* moving param position

* dependencies update => sass is now supporting node v21.

* controller.Base: config & method order

* controller.Base: refactoring & code cleanup

* v6.9.4"

