---
id: 604
title: 'build programs: simplify the use of commander'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-23T13:18:34Z'
updatedAt: '2020-05-23T13:32:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/604'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-23T13:32:04Z'
---
# build programs: simplify the use of commander

current:
```
commander = require('commander')
//...
const program = new commander.Command(programName)
```

new:
```
{ program } = require('commander')
//...
program
    .name(programName)
```

## Timeline

- 2020-05-23T13:18:34Z @tobiu added the `enhancement` label
- 2020-05-23T13:18:35Z @tobiu assigned to @tobiu
- 2020-05-23T13:28:36Z @tobiu referenced in commit `34dd1c5` - "build programs: simplify the use of commander #604"
- 2020-05-23T13:32:04Z @tobiu closed this issue

