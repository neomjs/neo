---
id: 5793
title: 'main.DomEvents: onChange() => only use checkValidity() in case it exists'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-08-19T10:02:00Z'
updatedAt: '2024-08-19T10:08:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5793'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-19T10:08:21Z'
---
# main.DomEvents: onChange() => only use checkValidity() in case it exists

e.g. video elements can trigger a change event when adjusting the volume.

the valid info was intended for input fields.

## Timeline

- 2024-08-19T10:02:00Z @tobiu added the `bug` label
- 2024-08-19T10:02:01Z @tobiu assigned to @tobiu
- 2024-08-19T10:08:18Z @tobiu referenced in commit `84b0e3a` - "main.DomEvents: onChange() => only use checkValidity() in case it exists #5793"
- 2024-08-19T10:08:21Z @tobiu closed this issue

