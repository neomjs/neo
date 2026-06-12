---
id: 4392
title: 'form.field.Picker: destroy() => enforce unmounting'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-05-08T09:30:48Z'
updatedAt: '2023-05-08T09:31:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4392'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-08T09:31:06Z'
---
# form.field.Picker: destroy() => enforce unmounting

there are some edge cases, where a picker field with an open picker overlay triggers a page navigation resulting in a `destroy()` OP. this does not always ensure that the overlay does get removed from the dom, so we need to adjust our logic.

@alberthashani

## Timeline

- 2023-05-08T09:30:48Z @tobiu added the `enhancement` label
- 2023-05-08T09:31:05Z @tobiu referenced in commit `a5693f9` - "form.field.Picker: destroy() => enforce unmounting #4392"
- 2023-05-08T09:31:06Z @tobiu closed this issue

