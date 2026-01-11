---
id: 7840
title: Optimize SessionService.summarizeSessions with Promise.all
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-21T12:58:27Z'
updatedAt: '2025-11-21T13:00:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7840'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T13:00:34Z'
---
# Optimize SessionService.summarizeSessions with Promise.all

Refactor `SessionService.summarizeSessions` to process unsummarized sessions in parallel using `Promise.all` instead of a sequential `for...of` loop. This will improve the startup time when there are multiple unsummarized sessions.

## Timeline

- 2025-11-21T12:58:29Z @tobiu added the `enhancement` label
- 2025-11-21T12:58:29Z @tobiu added the `ai` label
- 2025-11-21T13:00:10Z @tobiu assigned to @tobiu
- 2025-11-21T13:00:26Z @tobiu referenced in commit `636b6ba` - "Optimize SessionService.summarizeSessions with Promise.all #7840"
- 2025-11-21T13:00:34Z @tobiu closed this issue

