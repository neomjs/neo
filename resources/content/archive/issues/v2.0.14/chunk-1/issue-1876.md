---
id: 1876
title: 'create-app program: index file => main thread include'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-04-25T21:27:13Z'
updatedAt: '2021-04-30T10:54:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1876'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-30T10:54:46Z'
---
# create-app program: index file => main thread include

the generated output contains:
```
<script src="../../src/Main.mjs" type="module"></script>
```


running inside a workspace, it needs to be:
```
<script src="../../node_modules/neo.mjs/src/Main.mjs" type="module"></script>
```


## Timeline

- 2021-04-25T21:27:13Z @tobiu added the `bug` label
- 2021-04-25T21:27:13Z @tobiu assigned to @tobiu
### @tobiu - 2021-04-25T21:51:24Z

we also need to add:
```
workerBasePath  : '../../node_modules/neo.mjs/src/worker/'
```

and adjust:
```
appPath         : '../../apps/myapp/app.mjs', // ../../ at the start
```


            

- 2021-04-30T10:50:51Z @tobiu referenced in commit `c67ffef` - "create-app program: index file => main thread include #1876"
- 2021-04-30T10:54:46Z @tobiu closed this issue

