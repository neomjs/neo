---
id: 6557
title: 'grid.plugin.AnimateRows: onStoreLoad() => logic for creating new view positions'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-09T17:20:10Z'
updatedAt: '2025-03-09T17:21:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6557'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-09T17:21:51Z'
---
# grid.plugin.AnimateRows: onStoreLoad() => logic for creating new view positions

* related to https://github.com/neomjs/neo/issues/6555
* we need the new transform value
* we need the `is-even` row class for every 2nd row
* we need to ensure to NOT iterate over all records

i will extract the related part from the view logic.

## Timeline

- 2025-03-09T17:20:10Z @tobiu added the `enhancement` label
- 2025-03-09T17:20:10Z @tobiu assigned to @tobiu
- 2025-03-09T17:21:21Z @tobiu referenced in commit `ec85201` - "grid.plugin.AnimateRows: onStoreLoad() => logic for creating new view positions #6557"
- 2025-03-09T17:21:51Z @tobiu closed this issue

