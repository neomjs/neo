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
closedAt: '2025-07-26T19:17:41Z'
---
# component.Abstract: parentId default value

**Reported by:** @tobiu on 2025-07-26

* Regression issue after introducing `component.Abstract`
* `component.Base` had the default value `document.body`
* the new base class got `null` instead
* This breaks shared tooltips

