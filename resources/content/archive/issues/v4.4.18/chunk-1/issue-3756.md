---
id: 3756
title: 'form.field.Picker: getClientRectsThenShow() => parend rect'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-03T20:05:04Z'
updatedAt: '2023-01-03T21:44:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3756'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-03T21:44:43Z'
---
# form.field.Picker: getClientRectsThenShow() => parend rect

instead of `document.body`, we should fetch the dom rect of the parent node and subtract its top position from our picker top value.

## Timeline

- 2023-01-03T20:05:04Z @tobiu added the `enhancement` label
- 2023-01-03T20:05:04Z @tobiu assigned to @tobiu
- 2023-01-03T20:05:26Z @tobiu referenced in commit `168dea0` - "form.field.Picker: getClientRectsThenShow() => parend rect #3756"
### @tobiu - 2023-01-03T21:44:43Z

closed in favor to: https://github.com/neomjs/neo/issues/3757

- 2023-01-03T21:44:43Z @tobiu closed this issue

