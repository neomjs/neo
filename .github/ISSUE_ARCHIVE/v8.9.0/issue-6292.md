---
id: 6292
title: 'component.Base, container.Base: afterSetTheme()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-25T20:44:15Z'
updatedAt: '2025-01-25T20:45:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6292'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-25T20:45:04Z'
---
# component.Base, container.Base: afterSetTheme()

I just noticed the following, when assigning a new theme to a dialog:

![Image](https://github.com/user-attachments/assets/c406b0a5-6203-4115-aabe-b929b88c3c7d)

* Containers need to forward theme changes to their children
* `form.field.Picker` already forwards it to the `Picker`
* Since themes already get inherited on DOM level, we only need to apply it in case the value does not match the parent theme (less `update()` calls)

## Comments

### @tobiu - 2025-01-25 20:45

![Image](https://github.com/user-attachments/assets/0b204cc8-dcc5-494b-b79c-9e333b65ce01)

## Activity Log

- 2025-01-25 @tobiu added the `enhancement` label
- 2025-01-25 @tobiu assigned to @tobiu
- 2025-01-25 @tobiu referenced in commit `498c150` - "component.Base, container.Base: afterSetTheme() #6292"
- 2025-01-25 @tobiu closed this issue

