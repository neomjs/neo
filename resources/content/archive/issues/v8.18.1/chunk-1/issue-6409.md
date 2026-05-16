---
id: 6409
title: 'form.field.Combobox: a list selection change should hide the picker right away'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-08T21:06:28Z'
updatedAt: '2025-02-08T21:09:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6409'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-08T21:09:42Z'
---
# form.field.Combobox: a list selection change should hide the picker right away

* Inside the grid big data demo, this has become a problem, since creating e.g. 50k rows takes time.
* Inside the current version, the `hide()` waits until the change event callback (subscriber) is done.

https://github.com/user-attachments/assets/a96f0b86-6b8e-4754-8878-e5246096102c

## Timeline

- 2025-02-08T21:06:28Z @tobiu added the `enhancement` label
- 2025-02-08T21:06:28Z @tobiu assigned to @tobiu
- 2025-02-08T21:08:57Z @tobiu referenced in commit `3b864cc` - "form.field.Combobox: a list selection change should hide the picker right away #6409"
### @tobiu - 2025-02-08T21:09:43Z

https://github.com/user-attachments/assets/4c17b71f-1e95-4392-975c-ac70fa18caf8

I will create a follow-up ticket to adjust the field value earlier.

- 2025-02-08T21:09:43Z @tobiu closed this issue

