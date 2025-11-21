---
id: 7840
title: Optimize SessionService.summarizeSessions with Promise.all
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-21T12:58:27Z'
updatedAt: '2025-11-21T12:58:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7840'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Optimize SessionService.summarizeSessions with Promise.all

Refactor `SessionService.summarizeSessions` to process unsummarized sessions in parallel using `Promise.all` instead of a sequential `for...of` loop. This will improve the startup time when there are multiple unsummarized sessions.

## Activity Log

- 2025-11-21 @tobiu added the `enhancement` label
- 2025-11-21 @tobiu added the `ai` label

