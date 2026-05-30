---
id: 227
title: 'core.Base: set()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-01-23T18:22:48Z'
updatedAt: '2020-02-20T17:22:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/227'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-02-20T17:22:09Z'
---
# core.Base: set()

in short:

rename bulkConfigUpdate() to set()

this method should (optionally?) assign all values first and delay the afterSet methods until then (similar to constructing a cmp).

since this logic is not vdom related, it needs to get into core.Base.

## Timeline

- 2020-01-23T18:22:48Z @tobiu added the `enhancement` label
- 2020-01-23T18:22:48Z @tobiu assigned to @tobiu
- 2020-02-20T16:49:23Z @tobiu referenced in commit `2027343` - "core.Base: set() #227 => basic setup, new class symbol"
- 2020-02-20T16:58:14Z @tobiu referenced in commit `97a4baa` - "core.Base: set() #227 => symbol config, adjusted the class system test"
- 2020-02-20T17:21:40Z @tobiu referenced in commit `bb7c3da` - "core.Base: set() #227"
### @tobiu - 2020-02-20T17:22:09Z

implemented.

- 2020-02-20T17:22:09Z @tobiu closed this issue

