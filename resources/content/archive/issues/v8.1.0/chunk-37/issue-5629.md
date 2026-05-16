---
id: 5629
title: 'Portal App: we sometimes get invalid DomEvents: addDomListener() calls when navigating from Home to Learn'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-26T21:24:36Z'
updatedAt: '2024-07-26T21:34:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5629'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-26T21:34:20Z'
---
# Portal App: we sometimes get invalid DomEvents: addDomListener() calls when navigating from Home to Learn

![Screenshot 2024-07-26 at 23 21 07](https://github.com/user-attachments/assets/473e310a-9be2-421a-a8d7-9b05821b0769)

This one is interesting for multiple reasons:
* I did not scroll on the Home Page
* Yet we do get events from the Colors App, which only gets mounted in case we scroll down to that page
* Meaning: there must be an IntersectionObserver match when moving the node

To resolve this:
* We need to add a check to only switch `code.LivePreview`s to the preview tab, in case the view is still the active one and in case the route is still home (has to be mounted).

## Timeline

- 2024-07-26T21:24:36Z @tobiu added the `bug` label
- 2024-07-26T21:24:36Z @tobiu assigned to @tobiu
- 2024-07-26T21:34:15Z @tobiu referenced in commit `3d8f842` - "Portal App: we sometimes get invalid DomEvents: addDomListener() calls when navigating from Home to Learn #5629"
- 2024-07-26T21:34:20Z @tobiu closed this issue

