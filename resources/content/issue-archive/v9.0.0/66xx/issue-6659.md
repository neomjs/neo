---
id: 6659
title: 'examples/grid/bigData: column component based buttons sometimes lose their content'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-04-16T16:37:25Z'
updatedAt: '2025-04-16T22:38:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6659'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-16T22:38:29Z'
---
# examples/grid/bigData: column component based buttons sometimes lose their content

@gplanansky @camtnbikerrwc Not related to the fixed progress bar issue.

<img width="439" alt="Image" src="https://github.com/user-attachments/assets/3d149da4-0609-4925-aee7-f01e90d9ee9f" />

* The buffer range for rows is 5 by default inside the demo, and 5 buttons are affected, which gives us a hint
* The button `text` config never receives an empty value (already checked this first)
* button text nodes have dynamic ids: `neo-vnode-x`


## Timeline

- 2025-04-16T16:37:25Z @tobiu added the `bug` label
- 2025-04-16T16:37:25Z @tobiu assigned to @tobiu
- 2025-04-16T22:37:14Z @tobiu referenced in commit `1b0a079` - "#6659 workaround fix"
### @tobiu - 2025-04-16T22:38:29Z

i will close this one for now, but cycling components needs a follow-up ticket.

- 2025-04-16T22:38:29Z @tobiu closed this issue
- 2026-01-09T16:57:02Z @tobiu cross-referenced by #8475

