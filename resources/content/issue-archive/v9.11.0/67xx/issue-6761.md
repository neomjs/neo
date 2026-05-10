---
id: 6761
title: tab.BodyContainer
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-09T12:15:53Z'
updatedAt: '2025-06-09T12:16:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6761'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-09T12:16:51Z'
---
# tab.BodyContainer

* Re-adding the custom removal logic from the previous inline override
* When adding an existing tab into a different container, it will get automatically from the closest parent.
* In this case, we also want to remove the tab.header.Button from the tab.header.Toolbar.
* Use case: `SharedCovid.view.MainContainerController`

## Timeline

- 2025-06-09T12:15:54Z @tobiu added the `enhancement` label
- 2025-06-09T12:16:46Z @tobiu referenced in commit `792eb99` - "tab.BodyContainer #6761"
- 2025-06-09T12:16:51Z @tobiu closed this issue

