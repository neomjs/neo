---
id: 5638
title: 'Portal.view.home.parts.*: responsive plugin not working when navigating'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-07-28T15:43:40Z'
updatedAt: '2024-07-31T10:09:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5638'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-31T10:09:35Z'
---
# Portal.view.home.parts.*: responsive plugin not working when navigating

@Dinkh 

when directly opening `apps/portal/index.html#/home`, we do get a switch from hbox to vbox:

![Screenshot 2024-07-28 at 17 39 01](https://github.com/user-attachments/assets/16545011-8d4d-4c64-97ec-0491b1308432)

however, when we open the app with any other route like `#/learn` and then navigate to home, it does not behave the same:

![Screenshot 2024-07-28 at 17 38 37](https://github.com/user-attachments/assets/d4e36ce7-b91b-4381-b759-fb90c12b1ccf)

this affects the helix, colors & how sections (parts)

## Timeline

- 2024-07-28T15:43:41Z @tobiu added the `bug` label
- 2024-07-31T10:09:26Z @tobiu referenced in commit `7336b4e` - "Portal.view.home.parts.*: responsive plugin not working when navigating #5638"
- 2024-07-31T10:09:35Z @tobiu closed this issue

