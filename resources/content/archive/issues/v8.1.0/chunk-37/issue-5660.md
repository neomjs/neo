---
id: 5660
title: 'Portal.view.home.parts.BaseContainer: remove slide-animations'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-01T09:41:09Z'
updatedAt: '2024-08-01T09:44:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5660'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-01T09:44:36Z'
---
# Portal.view.home.parts.BaseContainer: remove slide-animations

@maxrahder: In case you want to remove the slide-animations, PLEASE open a dedicated ticket for it and don't just sneak important changes into a commit. Also: Uncommenting parts of the logic (keyframes were missing) is a great way to create **technical debt**, which simply must not happen:

<img width="881" alt="Screenshot 2024-08-01 at 11 38 52" src="https://github.com/user-attachments/assets/17cd3123-b844-4dc0-817d-5ae5b44fce8f">

Background info: @mxmrtns and some others were not too happy with the diagonal slide effects. I actually liked them (maybe in a weakened form). One way or the other: it is either keeping them or removing them properly. thanks!

@Dinkh

## Timeline

- 2024-08-01T09:41:09Z @tobiu added the `enhancement` label
- 2024-08-01T09:41:09Z @tobiu assigned to @tobiu
- 2024-08-01T09:43:56Z @tobiu referenced in commit `3c9cec8` - "Portal.view.home.parts.BaseContainer: remove slide-animations #5660"
- 2024-08-01T09:44:36Z @tobiu closed this issue

