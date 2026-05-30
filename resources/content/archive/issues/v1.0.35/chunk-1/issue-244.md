---
id: 244
title: 'Neo.mjs: autoGenerateGetSet() => cache by key name'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-02-24T18:33:38Z'
updatedAt: '2020-02-25T12:10:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/244'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-02-25T12:10:13Z'
---
# Neo.mjs: autoGenerateGetSet() => cache by key name

"Also, the object that you create in autoGenerateGetSet. It is the same for each key name. The property definition object for property foo in one class will be exactly the same as for another class. These can be cached statically and reused." (Nige, #242)

=> we can create a mapping object for caching

## Timeline

- 2020-02-24T18:33:38Z @tobiu added the `enhancement` label
- 2020-02-25T12:07:22Z @tobiu referenced in commit `7e07079` - "Neo.mjs: autoGenerateGetSet() => cache by key name #244"
### @tobiu - 2020-02-25T12:10:13Z

Stored inside the symbol `Neo[getSetCache]` now. There are not many occurrences yet, but this might change as the framework grows (tested it inside the docs app).

- 2020-02-25T12:10:13Z @tobiu closed this issue

