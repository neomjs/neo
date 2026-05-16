---
id: 1788
title: 'model.Component: createBindingByFormatter(), getDataScope()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-15T15:25:26Z'
updatedAt: '2021-04-15T15:25:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1788'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-15T15:25:56Z'
---
# model.Component: createBindingByFormatter(), getDataScope()

in case we access nested data inside a parent model, it can happen that a key root does not exist inside the current model.

example: `data.user.firstname`

would try to check if `firstname` exists on `data.user` which does not exist here.

so we need to add a check for the scope.

i will also add an empty object into `getDataScope()` as a placeholder. You can create models without any data which need parent access.

## Timeline

- 2021-04-15T15:25:26Z @tobiu added the `enhancement` label
- 2021-04-15T15:25:26Z @tobiu assigned to @tobiu
- 2021-04-15T15:25:49Z @tobiu referenced in commit `dfb27e5` - "model.Component: createBindingByFormatter(), getDataScope() #1788"
- 2021-04-15T15:25:56Z @tobiu closed this issue

