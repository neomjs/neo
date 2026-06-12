---
id: 3188
title: 'main.mixin.DeltaUpdates: changing node attributes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-23T12:45:13Z'
updatedAt: '2022-06-23T12:46:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3188'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-23T12:46:26Z'
---
# main.mixin.DeltaUpdates: changing node attributes

so far, neo was using:
`node[key] = val;`

this works fine for many attributes, but i just ran into edge cases where it does not (only tested in chrome).
minlength and maxlength did not get applied using this strategy.

`node.setAttribute(key, val);`
works fine for these edge-cases as well, so i will change it.

hopefully there are no side-effects, otherwise we will need to create follow-up tickets.

## Timeline

- 2022-06-23T12:45:13Z @tobiu added the `enhancement` label
- 2022-06-23T12:45:13Z @tobiu assigned to @tobiu
- 2022-06-23T12:46:19Z @tobiu referenced in commit `12ae25c` - "main.mixin.DeltaUpdates: changing node attributes #3188"
- 2022-06-23T12:46:26Z @tobiu closed this issue

