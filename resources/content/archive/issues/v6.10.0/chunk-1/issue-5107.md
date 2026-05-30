---
id: 5107
title: Revert the search params commit
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-11-27T13:02:17Z'
updatedAt: '2023-11-27T13:33:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5107'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-11-27T13:33:06Z'
---
# Revert the search params commit

We do need to revert https://github.com/neomjs/neo/commit/4f0544b1c9feb7e90f3e1f99f897a791393a9d96

Rationale: search params have to be in front of the hash value:
<img width="1172" alt="Screenshot 2023-11-27 at 11 38 04" src="https://github.com/neomjs/neo/assets/1177434/3d31324d-9e40-4e7c-8389-2c9dd73f29cf">

<img width="438" alt="Screenshot 2023-11-27 at 11 36 51" src="https://github.com/neomjs/neo/assets/1177434/5426d336-64bc-47a8-8731-f06ec3acbf20">

@ThorstenRaab 

## Timeline

- 2023-11-27T13:02:17Z @tobiu added the `enhancement` label
- 2023-11-27T13:02:18Z @tobiu assigned to @tobiu
- 2023-11-27T13:33:00Z @tobiu referenced in commit `a95e47a` - "Revert the search params commit #5107"
- 2023-11-27T13:33:06Z @tobiu closed this issue

