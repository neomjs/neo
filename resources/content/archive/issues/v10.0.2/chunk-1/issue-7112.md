---
id: 7112
title: 'component.Abstract: parentId default value'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-26T19:16:11Z'
updatedAt: '2025-07-26T19:17:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7112'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-26T19:17:41Z'
---
# component.Abstract: parentId default value

* Regression issue after introducing `component.Abstract`
* `component.Base` had the default value `document.body`
* the new base class got `null` instead
* This breaks shared tooltips

## Timeline

- 2025-07-26T19:16:11Z @tobiu assigned to @tobiu
- 2025-07-26T19:16:13Z @tobiu added the `bug` label
- 2025-07-26T19:17:25Z @tobiu referenced in commit `6f6bd29` - "component.Abstract: parentId default value #7112"
- 2025-07-26T19:17:41Z @tobiu closed this issue

