---
id: 5298
title: 'Portal.view.learn.PageSectionsPanel: scrolling the main content should update the list selection on the right side'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2024-03-04T23:00:24Z'
updatedAt: '2024-09-12T02:28:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5298'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:07Z'
---
# Portal.view.learn.PageSectionsPanel: scrolling the main content should update the list selection on the right side

@maxrahder @mxmrtns @ExtAnimal 

this might be a bit tricky. we need to listen to a scroll event and need to get the info which `h2` tag inside the content is the topmost visible one.

## Timeline

- 2024-03-04T23:00:25Z @tobiu added the `enhancement` label
### @tobiu - 2024-03-04T23:07:51Z

could be a fit for: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API

### @github-actions - 2024-08-29T02:25:31Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:31Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:06Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:07Z @github-actions closed this issue

