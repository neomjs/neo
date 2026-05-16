---
id: 3184
title: 'form.field.Text: isValid() => length checks'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-23T10:48:33Z'
updatedAt: '2022-06-23T10:51:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3184'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-23T10:51:07Z'
---
# form.field.Text: isValid() => length checks

since NumberField is extending TextField, we should use `toString()` before checking for maxLength and minLength.

## Timeline

- 2022-06-23T10:48:33Z @tobiu added the `enhancement` label
- 2022-06-23T10:48:34Z @tobiu assigned to @tobiu
- 2022-06-23T10:49:57Z @tobiu referenced in commit `ecd6726` - "form.field.Text: isValid() => length checks #3184"
- 2022-06-23T10:51:07Z @tobiu closed this issue

