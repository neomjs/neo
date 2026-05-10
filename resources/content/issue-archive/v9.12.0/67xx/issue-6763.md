---
id: 6763
title: 'data.Store: load() => enhance the catch part'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-11T10:11:41Z'
updatedAt: '2025-06-11T10:53:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6763'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-11T10:53:02Z'
---
# data.Store: load() => enhance the catch part

`Neo.Xhr.promiseJson(opts).catch(err => {/*...*/}).then(data => {/*...*/})`

The "problem" here is the way how promises got implemented in JS:

If we enter the catch part, `then()` will still get triggered.

## Timeline

- 2025-06-11T10:11:42Z @tobiu added the `enhancement` label
- 2025-06-11T10:52:56Z @tobiu referenced in commit `f6d9d96` - "data.Store: load() => enhance the catch part #6763"
- 2025-06-11T10:53:02Z @tobiu closed this issue

