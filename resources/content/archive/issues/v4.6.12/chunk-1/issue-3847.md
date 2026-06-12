---
id: 3847
title: Outdated documentation
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-01-12T09:45:33Z'
updatedAt: '2023-01-14T21:57:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3847'
author: deniztoprak
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-14T21:57:21Z'
---
# Outdated documentation

**Describe the bug**
On the [concept page](https://github.com/neomjs/neo/blob/dev/.github/CONCEPT.md) there is a statement that Safari doesn't support the JS modules inside web workers: 

> Firefox & Safari do not support JS modules inside workers yet, so the development mode only runs in Chrome v80+. Of course the dist (dev&prod) versions do run fine in FF & Safari as well.

Safari supports import declaration in workers since version 15:

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#browser_compatibility

This part should be updated to include only Firefox.


## Timeline

- 2023-01-12T09:45:34Z @deniztoprak added the `bug` label
- 2023-01-14T21:57:19Z @tobiu referenced in commit `32a7863` - "Outdated documentation #3847"
- 2023-01-14T21:57:21Z @tobiu closed this issue

