---
id: 5991
title: 'examples.component.multiWindowHelix.ViewportController: dynamic popup heights'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-30T15:48:24Z'
updatedAt: '2024-09-30T20:46:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5991'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-30T20:46:25Z'
---
# examples.component.multiWindowHelix.ViewportController: dynamic popup heights

we do need a different positioning for:
* running the main window as a "standalone" app
* running the main window inside a `code.LivePreview`

![Screenshot 2024-09-30 at 17 44 40](https://github.com/user-attachments/assets/a7044ef4-25c2-4561-815b-47f1b7c3f8ff)

![Screenshot 2024-09-30 at 17 45 08](https://github.com/user-attachments/assets/49c0e962-e18e-4e88-8fe8-1b6691da4c63)


## Timeline

- 2024-09-30T15:48:24Z @tobiu added the `enhancement` label
- 2024-09-30T15:48:24Z @tobiu assigned to @tobiu
- 2024-09-30T15:50:12Z @tobiu referenced in commit `e6ba158` - "examples.component.multiWindowHelix.ViewportController: dynamic popup heights #5991"
### @tobiu - 2024-09-30T16:01:00Z

just to be clear: this needs to work too:

<img width="1685" alt="Screenshot 2024-09-30 at 17 28 35" src="https://github.com/user-attachments/assets/e3203db3-3057-430a-bcc9-c78bc6ff106c">


- 2024-09-30T16:01:00Z @tobiu closed this issue
### @tobiu - 2024-09-30T20:45:32Z

* let us reopen this ticket to add a smarter check which works inside any `code.LivePreview` (not limited to the Portal App)
* let us also add the check into `examples.component.multiWindowCoronaGallery.ViewportController`, since we might add an inline demo into the Portal App later

- 2024-09-30T20:45:32Z @tobiu reopened this issue
- 2024-09-30T20:46:21Z @tobiu referenced in commit `054bd8d` - "#5991 examples.component.multiWindowHelix.ViewportController: smarter check for parent LivePreviews"
- 2024-09-30T20:46:25Z @tobiu closed this issue

