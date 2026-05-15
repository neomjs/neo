---
id: 6644
title: 'Covid.view.country.Table: afterSetCountry() => selection model adjustment'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-04-14T08:45:30Z'
updatedAt: '2025-04-14T08:50:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6644'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-14T08:50:01Z'
---
# Covid.view.country.Table: afterSetCountry() => selection model adjustment

* SMs got moved to the `table.View` level, so this method needs an update
* I will also trigger `onSelect()` on parent level, to keep it simple

## Timeline

- 2025-04-14T08:45:30Z @tobiu added the `bug` label
- 2025-04-14T08:49:54Z @tobiu referenced in commit `2bc5903` - "Covid.view.country.Table: afterSetCountry() => selection model adjustment #6644"
- 2025-04-14T08:50:02Z @tobiu closed this issue

