---
id: 6759
title: 'buildScripts/createApp: replace MainContainer with Viewport'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-09T09:09:48Z'
updatedAt: '2025-06-09T09:10:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6759'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-09T09:10:13Z'
---
# buildScripts/createApp: replace MainContainer with Viewport

* the other apps inside the top-level repo apps folder are using the name "Viewport", which feels more meaningful, so the script should generate the same output for consistency.
* replace `fs.mkdir` with `fs.mkdirpSync` => this removes overnesting

## Timeline

- 2025-06-09T09:09:49Z @tobiu added the `enhancement` label
- 2025-06-09T09:10:05Z @tobiu referenced in commit `f37e11c` - "buildScripts/createApp: replace MainContainer with Viewport #6759"
- 2025-06-09T09:10:13Z @tobiu closed this issue
- 2025-06-09T09:12:36Z @tobiu cross-referenced by #19

