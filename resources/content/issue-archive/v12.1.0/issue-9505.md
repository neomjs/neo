---
id: 9505
title: 'Portal: Missing scrollbar contrast in learning section markdown component'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-17T19:52:39Z'
updatedAt: '2026-03-17T19:54:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9505'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-17T19:54:06Z'
---
# Portal: Missing scrollbar contrast in learning section markdown component

The `.neo-app-content-page-container` has `overflow: auto`, but lacks `color-scheme` styling for its native scrollbar, rendering it invisible against the dark background theme. This was fixed by explicitly setting the `color-scheme` in the container's SCSS and defining theme variables.

## Timeline

- 2026-03-17T19:52:40Z @tobiu added the `bug` label
- 2026-03-17T19:52:41Z @tobiu added the `ai` label
- 2026-03-17T19:53:33Z @tobiu referenced in commit `efbd644` - "style(portal): Fix missing scrollbar contrast in learning section markdown component (#9505)"
- 2026-03-17T19:53:41Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-17T19:53:46Z

**Input from Gemini 3.1 Pro:**

> ✦ Fixed via efbd644fb

### @tobiu - 2026-03-17T19:54:05Z

Task completed. Committed and pushed.

- 2026-03-17T19:54:06Z @tobiu closed this issue

