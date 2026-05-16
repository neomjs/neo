---
id: 4307
title: 'form.field.Text: validate() => validator'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-04-20T12:44:03Z'
updatedAt: '2023-04-20T12:45:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4307'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-20T12:45:01Z'
---
# form.field.Text: validate() => validator

@Dinkh right now, the validator check happens first and all other rules are inside an else if block.

meaning: if a validator is specified and valid, other rules like `required` are getting ignored.

i think it is nicer in case a validator combines with default validation rules.

## Timeline

- 2023-04-20T12:44:03Z @tobiu added the `enhancement` label
- 2023-04-20T12:44:04Z @tobiu assigned to @tobiu
- 2023-04-20T12:44:58Z @tobiu referenced in commit `3c9999b` - "form.field.Text: validate() => validator #4307"
- 2023-04-20T12:45:01Z @tobiu closed this issue

