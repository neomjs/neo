---
id: 5209
title: Neo.applyClassConfig() => Neo.setupClass()
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-02-09T12:14:55Z'
updatedAt: '2024-02-20T20:35:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5209'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-20T20:35:54Z'
---
# Neo.applyClassConfig() => Neo.setupClass()

I actually like `setupClass()` better => shorter.

This is a breaking change though, so we should think about the renaming for the next major version.

## Timeline

- 2024-02-09T12:14:55Z @tobiu added the `enhancement` label
- 2024-02-20T20:25:45Z @tobiu referenced in commit `aea9826` - "#5209 Neo.setupClass() => non-breaking PoC"
- 2024-02-20T20:30:33Z @tobiu referenced in commit `bdc2e49` - "#5209 Neo.setupClass() => changed all spots"
### @tobiu - 2024-02-20T20:35:54Z

found a non-breaking way to do it. `applyClassConfig()` will get deprecated in v8, but still works fine for now.

- 2024-02-20T20:35:54Z @tobiu closed this issue
- 2024-03-26T16:29:34Z @tobiu referenced in commit `0b7206f` - "#5209 Neo.setupClass() => non-breaking PoC"
- 2024-03-26T16:29:34Z @tobiu referenced in commit `945a070` - "#5209 Neo.setupClass() => changed all spots"

