---
id: 5622
title: 'plugin.Resizable: new corner grip handles'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-25T15:18:10Z'
updatedAt: '2024-07-25T15:19:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5622'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-25T15:19:01Z'
---
# plugin.Resizable: new corner grip handles

the current version looks broken => the base icon probably got changed with the new font-awesome major version and the clip paths no longer match.

let us just use https://fontawesome.com/icons/angles-right?f=classic&s=solid

and rotate it by 45deg steps to match each corner.

## Timeline

- 2024-07-25T15:18:10Z @tobiu added the `enhancement` label
- 2024-07-25T15:18:10Z @tobiu assigned to @tobiu
- 2024-07-25T15:18:25Z @tobiu referenced in commit `576972c` - "plugin.Resizable: new corner grip handles #5622"
### @tobiu - 2024-07-25T15:19:01Z

![Screenshot 2024-07-25 at 17 18 46](https://github.com/user-attachments/assets/aedd5ee7-acc9-4e0d-8577-8b7a220ca442)


- 2024-07-25T15:19:01Z @tobiu closed this issue
- 2024-07-25T15:21:09Z @tobiu referenced in commit `3164d2e` - "plugin.Resizable: new corner grip handles #5622 cleanup"

