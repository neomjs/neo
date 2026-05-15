---
id: 6908
title: 'Portal.view.learn.ContentComponent: updateContentSectionsStore() => headline code got lost'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-06-30T13:36:51Z'
updatedAt: '2025-06-30T13:37:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6908'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-30T13:37:28Z'
---
# Portal.view.learn.ContentComponent: updateContentSectionsStore() => headline code got lost

* When removing code blocks for `PageSectionsList`, I accidentally also removed them from article headlines.
* We need 2 separate replacements.

## Timeline

- 2025-06-30T13:36:52Z @tobiu added the `bug` label
- 2025-06-30T13:37:15Z @tobiu referenced in commit `1972267` - "Portal.view.learn.ContentComponent: updateContentSectionsStore() => headline code got lost #6908"
- 2025-06-30T13:37:28Z @tobiu closed this issue

