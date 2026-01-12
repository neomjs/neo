---
id: 6577
title: 'manager.Component: getVnodeTree() => add  a check if the queried cmp exists'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-03-17T14:11:43Z'
updatedAt: '2025-03-17T14:19:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6577'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-17T14:19:52Z'
---
# manager.Component: getVnodeTree() => add  a check if the queried cmp exists

I stumbled upon an edge case, where there is no cmp found for a given cmp id => `code.LivePreview` => changing the value inside the IDE results in JS errors.

<img width="564" alt="Image" src="https://github.com/user-attachments/assets/6e4f9c76-77c4-4754-80db-282e13cc3dfc" />

Assumption: it happens when a cmp is getting destroyed.

## Timeline

- 2025-03-17T14:11:43Z @tobiu added the `bug` label
- 2025-03-17T14:11:43Z @tobiu assigned to @tobiu
- 2025-03-17T14:19:48Z @tobiu referenced in commit `7dd07c9` - "manager.Component: getVnodeTree() => add a check if the queried cmp exists #6577"
- 2025-03-17T14:19:52Z @tobiu closed this issue

