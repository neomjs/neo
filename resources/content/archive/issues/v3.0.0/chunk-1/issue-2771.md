---
id: 2771
title: 'core.Base: setFields() => Neo.hasPropertySetter() check'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-12-12T21:27:44Z'
updatedAt: '2021-12-12T21:29:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2771'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-12-12T21:29:10Z'
---
# core.Base: setFields() => Neo.hasPropertySetter() check

we need to ensure that we do not assign values for own get / set based class fields.

inside the neo scope, this also affects the cls, style and vdom edge cases.

## Timeline

- 2021-12-12T21:27:44Z @tobiu added the `enhancement` label
- 2021-12-12T21:27:44Z @tobiu assigned to @tobiu
- 2021-12-12T21:28:01Z @tobiu referenced in commit `81c7f45` - "core.Base: setFields() => Neo.hasPropertySetter() check #2771"
- 2021-12-12T21:29:10Z @tobiu closed this issue

