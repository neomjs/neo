---
id: 948
title: 'form.field.Number: minValue is too restrictive'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-07-20T10:25:46Z'
updatedAt: '2023-05-12T11:09:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/948'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-12T11:09:12Z'
---
# form.field.Number: minValue is too restrictive

e.g. in case you set minValue = 8, it is impossible to type 10, since the 1 will already get replaced with 8 after typing it.

you can still change it using the mouse wheel or the trigger buttons, but the replacement (& change event) should happen on inputEl blur instead of keyup.

## Timeline

- 2020-07-20T10:25:46Z @tobiu added the `enhancement` label
- 2023-05-12T11:09:12Z @tobiu closed this issue

