---
id: 5780
title: 'Portal App: add the HighlightJS min version into resources'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-18T11:24:24Z'
updatedAt: '2024-08-18T11:24:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5780'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-18T11:24:56Z'
---
# Portal App: add the HighlightJS min version into resources

* moving it into a lib sub-folder (for the docs app as well)
* sticking to v9 (v11 has 4x the file-size)
* updating `highlightAuto()` => only return the value (less traffic, other props will break in v11)

## Timeline

- 2024-08-18T11:24:24Z @tobiu added the `enhancement` label
- 2024-08-18T11:24:25Z @tobiu assigned to @tobiu
- 2024-08-18T11:24:51Z @tobiu referenced in commit `9110ce5` - "Portal App: add the HighlightJS min version into resources #5780"
- 2024-08-18T11:24:56Z @tobiu closed this issue

