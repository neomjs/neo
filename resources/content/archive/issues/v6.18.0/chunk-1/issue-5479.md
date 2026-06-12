---
id: 5479
title: Neo.setupClass() => applyOverwrites can break in dist envs
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-06-23T21:19:25Z'
updatedAt: '2024-06-23T21:20:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5479'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-23T21:20:35Z'
---
# Neo.setupClass() => applyOverwrites can break in dist envs

@Dinkh: only seen it for the IdGenerator (which is not extending `core.Base`).
<img width="1210" alt="Screenshot 2024-06-23 at 23 15 24" src="https://github.com/neomjs/neo/assets/1177434/29af9f3b-acb5-4ab8-ba4c-fd0f5d5a3917">


## Timeline

- 2024-06-23T21:19:25Z @tobiu added the `bug` label
- 2024-06-23T21:19:26Z @tobiu assigned to @tobiu
- 2024-06-23T21:20:30Z @tobiu referenced in commit `575f81d` - "Neo.setupClass() => applyOverwrites can break in dist envs #5479"
- 2024-06-23T21:20:35Z @tobiu closed this issue

