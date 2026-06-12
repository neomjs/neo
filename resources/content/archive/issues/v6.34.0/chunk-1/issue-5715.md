---
id: 5715
title: Portal.view.home => non-snapped scrolling allows to scroll the document outside of the visible area
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-06T20:12:02Z'
updatedAt: '2024-08-06T20:13:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5715'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-06T20:13:26Z'
---
# Portal.view.home => non-snapped scrolling allows to scroll the document outside of the visible area

this one is super weird:
![Screenshot 2024-08-06 at 21 41 59](https://github.com/user-attachments/assets/77d3de85-4466-4e6f-8696-96626da54d09)

![Screenshot 2024-08-06 at 21 42 12](https://github.com/user-attachments/assets/7278b07f-1059-4e97-a26d-07a73d1d6342)

i have not found the root-cause, since i never encountered it for any neo app before.

the only way to fix it was adding `position: fixed` to the viewport div. we need to limit it to direct viewport children of the document body to not break LivePreviews (which can mount a viewport into a div).

@rwaters 

## Timeline

- 2024-08-06T20:12:02Z @tobiu added the `enhancement` label
- 2024-08-06T20:12:02Z @tobiu assigned to @tobiu
- 2024-08-06T20:13:18Z @tobiu referenced in commit `05b18d6` - "Portal.view.home => non-snapped scrolling allows to scroll the document outside of the visible area #5715"
- 2024-08-06T20:13:26Z @tobiu closed this issue

