---
id: 1830
title: 'model.Component: getFormatterVariables() => use regex.replace()'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-04-20T12:06:34Z'
updatedAt: '2021-04-20T12:24:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1830'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-20T12:24:39Z'
---
# model.Component: getFormatterVariables() => use regex.replace()

follow up ticket for #1829 

we need to replace `part.match(dataVariableRegex)` with `part.replace(dataVariableRegex, "data$2")`

to ensure that the vm code can access the data properties.

## Timeline

- 2021-04-20T12:06:34Z @tobiu added the `enhancement` label
### @tobiu - 2021-04-20T12:23:42Z

`replace()` was a bad idea, since it replaces the match content instead of parts of the content.

we can still do it.

- 2021-04-20T12:24:31Z @tobiu referenced in commit `b2fb5d3` - "#1830 model.Component: getFormatterVariables() => remove the variable content up to the first dot."
- 2021-04-20T12:24:39Z @tobiu closed this issue

