---
id: 5843
title: buildScripts/tools/createExample => index.html => MicroLoader path not generic
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2024-08-27T21:55:47Z'
updatedAt: '2024-12-10T02:47:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5843'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-12-10T02:47:15Z'
---
# buildScripts/tools/createExample => index.html => MicroLoader path not generic

@ThorstenRaab: depending on the depth of the folder inside examples, the MicroLoader needs to go upwards to the root.

e.g.
```
<script src="../../../src/MicroLoader.mjs" type="module"></script>
<script src="../../../../src/MicroLoader.mjs" type="module"></script>
```

## Timeline

- 2024-08-27T21:55:47Z @tobiu added the `bug` label
### @github-actions - 2024-11-26T02:41:00Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-11-26T02:41:01Z @github-actions added the `stale` label
### @github-actions - 2024-12-10T02:47:15Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-12-10T02:47:15Z @github-actions closed this issue

