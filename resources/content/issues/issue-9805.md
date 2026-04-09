---
id: 9805
title: Centralize sandman_handoff.md generation in DreamService
state: CLOSED
labels:
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T08:12:03Z'
updatedAt: '2026-04-09T09:06:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9805'
author: tobiu
commentsCount: 1
parentIssue: 9803
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:05:49Z'
---
# Centralize sandman_handoff.md generation in DreamService

## Problem
The `sandman_handoff.md` file grows infinitely because `extractTopology` and capacity inference functions blindly append markdown strings.

## Solution
Deprecate direct string appending to the markdown file during memory passes. Instead, have `synthesizeGoldenPath` execute a purely functional render of the handoff file from the active SQLite nodes, writing the Golden Path and cleanly sorting the structural gaps and limitations dynamically into the file.

## Parent Epic
Part of Epic #9803

## Timeline

- 2026-04-09T08:12:04Z @tobiu added the `ai` label
- 2026-04-09T08:12:04Z @tobiu added the `architecture` label
- 2026-04-09T08:12:16Z @tobiu added parent issue #9803
### @tobiu - 2026-04-09T09:05:48Z

Implemented natively in DreamService.mjs during Epic #9803.

- 2026-04-09T09:05:49Z @tobiu closed this issue
- 2026-04-09T09:06:11Z @tobiu assigned to @tobiu

