---
id: 9992
title: Refactor Test Gap Detection Logic in DreamService
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-04-14T08:19:14Z'
updatedAt: '2026-04-14T08:19:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9992'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Test Gap Detection Logic in DreamService

### Description
The current test gap detection in `DreamService.mjs` attempts to map files/classes to tests via simple string path scanning (`testFilePaths.some(p => ...)`). This approach is utterly flawed and generates inaccurate test constraint alerts.

### Objective
- Develop a deterministic mechanism to accurately correlate source classes with their specific Playwright/validation test files.
- Replace the rudimentary path token scanning with a robust codebase parsing strategy or direct test manifest alignment.

## Timeline

- 2026-04-14T08:19:15Z @tobiu added the `bug` label
- 2026-04-14T08:19:15Z @tobiu added the `ai` label

