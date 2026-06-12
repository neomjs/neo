---
id: 4397
title: 'form.field.ZipCode: beforeSetCountryField()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-05-08T17:17:33Z'
updatedAt: '2023-05-08T17:19:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4397'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-08T17:19:19Z'
---
# form.field.ZipCode: beforeSetCountryField()

in case a ZipCode field has a country field which is inside the parent items array at a higher index, it can happen that getReference() does not find it right away (before the other field is constructed).

we do need a repeating "ping" to detect it.

## Timeline

- 2023-05-08T17:17:33Z @tobiu added the `enhancement` label
- 2023-05-08T17:17:33Z @tobiu assigned to @tobiu
- 2023-05-08T17:18:50Z @tobiu referenced in commit `b1f2e74` - "form.field.ZipCode: beforeSetCountryField() #4397"
- 2023-05-08T17:19:19Z @tobiu closed this issue

