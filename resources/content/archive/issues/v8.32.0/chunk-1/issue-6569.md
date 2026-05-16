---
id: 6569
title: 'Build scripts: soften the neo.mjs repo name check'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-03-12T10:36:45Z'
updatedAt: '2025-03-12T10:37:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6569'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-12T10:37:18Z'
---
# Build scripts: soften the neo.mjs repo name check

* For forks or external framework enhancements, it makes sense to soften the repo check a little bit.
* Old: `packageJson.name === 'neo.mjs'`
* New: `packageJson.name.includes('neo.mjs')`


## Timeline

- 2025-03-12T10:36:45Z @tobiu added the `enhancement` label
- 2025-03-12T10:37:13Z @tobiu referenced in commit `aef8689` - "Build scripts: soften the neo.mjs repo name check #6569"
- 2025-03-12T10:37:18Z @tobiu closed this issue

