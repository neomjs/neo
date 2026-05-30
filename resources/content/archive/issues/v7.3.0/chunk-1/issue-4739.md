---
id: 4739
title: Docs app source code view formatting (regression issue)
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-08-16T13:54:13Z'
updatedAt: '2024-09-13T02:29:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4739'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:13Z'
---
# Docs app source code view formatting (regression issue)

source code views should look like this:
<img width="1038" alt="Screenshot 2023-08-16 at 15 48 16" src="https://github.com/neomjs/neo/assets/1177434/25e65fac-d3e4-4db1-93b7-feb425ba1287">

instead i am getting this version very often:
<img width="1031" alt="Screenshot 2023-08-16 at 15 47 26" src="https://github.com/neomjs/neo/assets/1177434/27c245d4-3692-4beb-8f97-6f4bc61d9674">

not exactly sure yet what is happening. highlight js is still parsing it and formatting it as code. maybe the tool is just not recognising that the code is javascript. just a guess. we should look into it.

## Timeline

- 2023-08-16T13:54:13Z @tobiu added the `bug` label
### @github-actions - 2024-08-29T02:26:45Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:45Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:13Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:14Z @github-actions closed this issue

