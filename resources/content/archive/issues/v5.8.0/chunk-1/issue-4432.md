---
id: 4432
title: 'form.field.Base: name_'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-05-16T08:05:23Z'
updatedAt: '2023-05-16T08:15:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4432'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-16T08:15:55Z'
---
# form.field.Base: name_

right now, the `name_` config got implemented for `form.field.Checkbox` and `form.field.Text` is using it indirectly (form containers assume that it can be there).

this does not feel clean, so the base field should host this config.

## Timeline

- 2023-05-16T08:05:23Z @tobiu added the `enhancement` label
- 2023-05-16T08:05:23Z @tobiu assigned to @tobiu
- 2023-05-16T08:15:50Z @tobiu referenced in commit `7fe33d8` - "form.field.Base: name_ #4432"
- 2023-05-16T08:15:55Z @tobiu closed this issue

