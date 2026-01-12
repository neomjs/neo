---
id: 6410
title: 'form.field.Combobox: fireChangeEvent() needs to happen once the entire afterSetValue parent chain is done'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-08T21:12:35Z'
updatedAt: '2025-02-08T22:21:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6410'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-08T22:21:18Z'
---
# form.field.Combobox: fireChangeEvent() needs to happen once the entire afterSetValue parent chain is done

* We need to break the default order of execution to ensure that field value updates happen before change event subscriber logic is done.

https://github.com/user-attachments/assets/1cc55c10-9b5d-4a23-bce6-67739fe7673f

## Timeline

- 2025-02-08T21:12:35Z @tobiu added the `enhancement` label
- 2025-02-08T21:12:35Z @tobiu assigned to @tobiu
- 2025-02-08T21:13:27Z @tobiu referenced in commit `e57facd` - "form.field.Combobox: fireChangeEvent() needs to happen once the entire afterSetValue parent chain is done #6410"
### @tobiu - 2025-02-08T21:15:09Z

https://github.com/user-attachments/assets/56b0ee38-c5a2-4537-a554-06487f798ac6

- 2025-02-08T21:15:09Z @tobiu closed this issue
### @tobiu - 2025-02-08T22:20:44Z

we need to increase the delay for deployments

- 2025-02-08T22:20:45Z @tobiu reopened this issue
- 2025-02-08T22:21:13Z @tobiu referenced in commit `bc7f26f` - "#6410 increasing the change event delay to 30ms"
- 2025-02-08T22:21:18Z @tobiu closed this issue

