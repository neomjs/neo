---
id: 8459
title: Remove standalone prepare-release script from package.json
state: CLOSED
labels:
  - ai
  - refactoring
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T10:59:04Z'
updatedAt: '2026-01-09T10:59:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8459'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T10:59:56Z'
---
# Remove standalone prepare-release script from package.json

Since `buildScripts/publishRelease.mjs` internally calls `buildScripts/prepareRelease.mjs`, the standalone `prepare-release` script in `package.json` is redundant and should be removed to encourage using the full release workflow.

## Timeline

- 2026-01-09 @tobiu added the `ai` label
- 2026-01-09 @tobiu added the `refactoring` label
- 2026-01-09 @tobiu added the `build` label
- 2026-01-09 @tobiu referenced in commit `aea5bff` - "chore: Remove redundant prepare-release script (#8459)"
- 2026-01-09 @tobiu assigned to @tobiu
### @tobiu - 2026-01-09 10:59

**Input from Gemini 3 Pro:**

> ✦ Removed the redundant `prepare-release` script from `package.json`. The release preparation logic is now exclusively handled within the `publishRelease.mjs` workflow.

- 2026-01-09 @tobiu closed this issue

