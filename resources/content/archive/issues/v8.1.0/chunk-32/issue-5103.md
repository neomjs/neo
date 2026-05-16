---
id: 5103
title: 6.9.12 neo-dev.zip  -> unzip -> npm install -> npm run build-all fails
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-11-20T15:03:40Z'
updatedAt: '2023-11-21T00:17:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5103'
author: gplanansky
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-11-21T00:14:17Z'
---
# 6.9.12 neo-dev.zip  -> unzip -> npm install -> npm run build-all fails

**Describe the bug**
Installing 6.9.12 dev by:
a. download neo-dev.zip 
b. unzip neo-dev.zip && cd neo-dev
c. npm install
d. npm run build-all

Fails on step (d) with error:

```
ERROR in ./examples/container/dialog/MainContainerController.mjs 28:31-75
Module not found: Error: Can't resolve '../../../src/container/Dialog.mjs' in '/Users/george/foo/neo-dev/examples/container/dialog'
resolve '../../../src/container/Dialog.mjs' in '/Users/george/foo/neo-dev/examples/container/dialog'
  using description file: /Users/george/foo/neo-dev/package.json (relative path: ./examples/container/dialog)
    Field 'browser' doesn't contain a valid alias configuration
    using description file: /Users/george/foo/neo-dev/package.json (relative path: ./src/container/Dialog.mjs)
```
Log attached.  

**Expected behavior:**   This has worked & still does with previous versions, most recent being 6.9.2
[neo-dev-6.9.12-build-all-log.txt](https://github.com/neomjs/neo/files/13416364/neo-dev-6.9.12-build-all-log.txt)





## Timeline

- 2023-11-20T15:03:40Z @gplanansky added the `bug` label
- 2023-11-21T00:14:17Z @gplanansky closed this issue
### @gplanansky - 2023-11-21T00:17:35Z

Rsolved by tobiu:   src/container/Dialog.mjs has been obsoleted.  So examples/container/dialog, which depended on it, no longer pertains and should be removed.


