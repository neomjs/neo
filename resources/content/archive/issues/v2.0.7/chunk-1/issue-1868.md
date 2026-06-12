---
id: 1868
title: 'vdom.Helper: update() => changing the value of dom attributes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-25T11:17:24Z'
updatedAt: '2021-04-25T11:18:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1868'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-25T11:18:14Z'
---
# vdom.Helper: update() => changing the value of dom attributes

```
if (Neo.isEmpty(value)) {
    // ignore empty arrays & objects
}
```

this part should allow empty strings.

use case: manually setting the value of a textfield to ''.

the clear trigger would set it to null, but in case you bind the value to a vm, empty strings can not result in deltas without the change.

## Timeline

- 2021-04-25T11:17:24Z @tobiu added the `enhancement` label
- 2021-04-25T11:17:24Z @tobiu assigned to @tobiu
- 2021-04-25T11:18:07Z @tobiu referenced in commit `a30c96d` - "vdom.Helper: update() => changing the value of dom attributes #1868"
- 2021-04-25T11:18:14Z @tobiu closed this issue

