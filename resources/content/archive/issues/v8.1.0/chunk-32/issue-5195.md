---
id: 5195
title: 'Neo.form.field.TextArea: AutoGrow for readOnly true'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-02-01T15:46:55Z'
updatedAt: '2024-02-05T15:37:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5195'
author: pensuwan-k
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-05T15:37:30Z'
---
# Neo.form.field.TextArea: AutoGrow for readOnly true

AutoGrow is only triggered by an input event (as seen in `Neo.main.DomAccess` monitorAutoGrow()).
But a read-only field cannot trigger an input event. 

It would be nice if autoGrow would also work for read-only fields.


## Timeline

- 2024-02-01T15:46:55Z @pensuwan-k added the `enhancement` label
- 2024-02-05T15:37:23Z @tobiu referenced in commit `3fe3fdf` - "Neo.form.field.TextArea: AutoGrow for readOnly true #5195"
- 2024-02-05T15:37:30Z @tobiu closed this issue
- 2024-03-26T16:29:28Z @tobiu referenced in commit `3058441` - "Neo.form.field.TextArea: AutoGrow for readOnly true #5195"

