---
id: 5750
title: 'main.addon.AMCharts: delay the library loading'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2024-08-13T17:55:15Z'
updatedAt: '2024-11-26T02:41:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5750'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-26T02:41:02Z'
---
# main.addon.AMCharts: delay the library loading

it should not interfere with the critical rendering path (lighthouse):
<img width="1578" alt="Screenshot 2024-08-13 at 18 57 46" src="https://github.com/user-attachments/assets/b7f0c262-62e1-48da-803c-4c5938c9e628">

especially not, when the first route of the app does not even use charts.

## Timeline

- 2024-08-13T17:55:15Z @tobiu added the `enhancement` label
- 2024-08-13T17:55:16Z @tobiu assigned to @tobiu
- 2024-08-13T17:56:46Z @tobiu cross-referenced by #5751
### @github-actions - 2024-11-12T02:29:27Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-11-12T02:29:27Z @github-actions added the `stale` label
### @github-actions - 2024-11-26T02:41:02Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-11-26T02:41:02Z @github-actions closed this issue

