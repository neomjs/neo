---
id: 5668
title: 'Portal.view.home.parts.MainNeo: logo image to text positioning'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2024-08-01T18:19:49Z'
updatedAt: '2024-11-15T02:40:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5668'
author: tobiu
commentsCount: 7
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-15T02:40:04Z'
---
# Portal.view.home.parts.MainNeo: logo image to text positioning

@mxmrtns @rwaters: to me the separated styling looks different than the combined svg version.

![Screenshot 2024-08-01 at 20 17 30](https://github.com/user-attachments/assets/5b95810d-a5c6-4631-9576-d160d8a52a24)

e.g. with a negative margin-top of 8px for the text it looks closer:
![Screenshot 2024-08-01 at 20 17 41](https://github.com/user-attachments/assets/97b883b4-e789-441b-a707-f029e31d3e07)


## Timeline

- 2024-08-01T18:19:49Z @tobiu added the `enhancement` label
- 2024-08-01T18:19:49Z @tobiu assigned to @tobiu
- 2024-08-01T18:21:43Z @tobiu referenced in commit `0384135` - "Portal.view.home.parts.MainNeo: logo image to text positioning #5668"
- 2024-08-01T18:21:59Z @tobiu closed this issue
- 2024-08-01T20:33:22Z @tobiu reopened this issue
- 2024-08-01T20:33:41Z @tobiu referenced in commit `162e2b2` - "Portal.view.home.parts.MainNeo: logo image to text positioning #5668"
### @tobiu - 2024-08-01T20:33:54Z

for @rwaters 

- 2024-08-01T20:33:54Z @tobiu closed this issue
### @tobiu - 2024-08-01T20:50:06Z

forgot to double-check the change on mobile.

- 2024-08-01T20:50:06Z @tobiu reopened this issue
- 2024-08-01T20:50:19Z @tobiu referenced in commit `d6c2d44` - "Portal.view.home.parts.MainNeo: logo image to text positioning #5668"
- 2024-08-01T20:50:22Z @tobiu closed this issue
### @tobiu - 2024-08-01T20:55:20Z

one last time...

- 2024-08-01T20:55:21Z @tobiu reopened this issue
- 2024-08-01T20:55:36Z @tobiu referenced in commit `b565f3b` - "Portal.view.home.parts.MainNeo: logo image to text positioning #5668"
### @tobiu - 2024-08-01T21:25:08Z

reopening again. missed the `height: 10VW` scaling part.

not sure if it is even possible without also scaling the h1 then.

![Screenshot 2024-08-01 at 23 23 03](https://github.com/user-attachments/assets/458ca18c-6d52-4764-9fd4-682bb55cdad0)

![Screenshot 2024-08-01 at 23 23 28](https://github.com/user-attachments/assets/5b8f9bd2-a693-4d5f-9fa7-f5d26443be69)

### @tobiu - 2024-08-01T21:26:35Z

guess what we could do: logo & text combined svg for where it fits, separate icon svg only when above the text.

### @github-actions - 2024-10-31T02:36:22Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-31T02:36:23Z @github-actions added the `stale` label
### @github-actions - 2024-11-15T02:40:03Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-11-15T02:40:04Z @github-actions closed this issue

