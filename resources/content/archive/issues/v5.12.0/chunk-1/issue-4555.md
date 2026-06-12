---
id: 4555
title: form.field.Select editable config not working
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-07-24T07:01:31Z'
updatedAt: '2023-07-24T09:04:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4555'
author: pensuwan-k
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-24T09:04:04Z'
---
# form.field.Select editable config not working

I use module form.field.Select with editable: false. But the input can still be edit. 

## Timeline

- 2023-07-24T07:01:31Z @pensuwan-k added the `bug` label
### @tobiu - 2023-07-24T07:31:43Z

hi kiattipoom!

i already took a quick look last friday:
<img width="2120" alt="Screenshot 2023-07-24 at 09 29 06" src="https://github.com/neomjs/neo/assets/1177434/dfd77cb6-5dde-4fba-bd88-09528ec39eeb">

`pointer-events: none` as well as `user-select: none` do still get applied.

however, the field does receive focus. maybe being set programmatically? definitely a regression bug.

- 2023-07-24T09:03:43Z @tobiu referenced in commit `829475c` - "form.field.Select editable config not working #4555"
- 2023-07-24T09:04:04Z @tobiu closed this issue

