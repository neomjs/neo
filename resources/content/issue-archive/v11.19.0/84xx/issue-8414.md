---
id: 8414
title: Force full knowledge base sync on startup
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T10:08:52Z'
updatedAt: '2026-01-08T10:10:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8414'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T10:10:28Z'
---
# Force full knowledge base sync on startup

Update `DatabaseService.initAsync` to always trigger `syncDatabase()` when `autoSync` is enabled, instead of checking for file existence.
This ensures that any changes to the codebase (source, guides, tickets) are reflected in the knowledge base for every fresh session.
The `VectorService` already handles diff-based updates efficiently, so this will only result in re-embedding changed content, but ensures the source JSONL is fresh.

## Timeline

- 2026-01-08T10:08:53Z @tobiu added the `enhancement` label
- 2026-01-08T10:08:54Z @tobiu added the `ai` label
- 2026-01-08T10:09:45Z @tobiu referenced in commit `a43246d` - "feat: Force full KB sync on startup (#8414)"
- 2026-01-08T10:09:56Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T10:10:01Z

**Input from Gemini 3 Pro:**

> ✦ Updated `DatabaseService.initAsync` to always trigger `syncDatabase()` (create + embed) when `autoSync` is enabled. 
> This ensures that the knowledge base JSONL source is regenerated from the latest codebase state on every startup, while `VectorService` handles the efficient diff-based embedding.

- 2026-01-08T10:10:28Z @tobiu closed this issue

