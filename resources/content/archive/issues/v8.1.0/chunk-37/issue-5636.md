---
id: 5636
title: 'dialog.Base: header styling inside theme-neo-light'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-28T14:59:16Z'
updatedAt: '2024-07-28T15:13:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5636'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-28T15:13:37Z'
---
# dialog.Base: header styling inside theme-neo-light

@mxmrtns 

Inside `theme-light` dialogs look like this:
![Screenshot 2024-07-28 at 16 54 38](https://github.com/user-attachments/assets/29c988b7-3630-44c8-a99a-32294f697688)

Inside our new theme the styling is still missing:
![Screenshot 2024-07-28 at 16 54 29](https://github.com/user-attachments/assets/2e2aa95d-d260-4bfc-8fcb-bfc67c5aee27)

For now, I will just add overrides into the theme based scss file to make it look a bit more reasonable.

We can create follow-up tickets, in case the header toolbar should keep a bigger height.

## Timeline

- 2024-07-28T14:59:16Z @tobiu added the `enhancement` label
- 2024-07-28T14:59:16Z @tobiu assigned to @tobiu
- 2024-07-28T15:10:34Z @tobiu referenced in commit `a67b7ad` - "dialog.Base: header styling inside theme-neo-light #5636"
- 2024-07-28T15:13:06Z @tobiu referenced in commit `9855cff` - "#5636 using core tokens for colors"
### @tobiu - 2024-07-28T15:13:37Z

![Screenshot 2024-07-28 at 17 13 17](https://github.com/user-attachments/assets/a21fbf27-3f62-4d31-bc1d-427dcb6014f3)


- 2024-07-28T15:13:37Z @tobiu closed this issue

