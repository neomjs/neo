---
id: 9733
title: 'AI Infrastructure: Add SQLite Vector Migration Utility Script'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T15:46:02Z'
updatedAt: '2026-04-06T15:46:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9733'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T15:46:20Z'
---
# AI Infrastructure: Add SQLite Vector Migration Utility Script

### Description
Commit the SQLite Vector Rebuild script (`buildScripts/ai/rebuildSQLiteVectors.mjs`) to the repository.

### Motivation
This utility script was developed during the M5 Max / Ollama infrastructure migration to safely drop and cleanly re-index SQLite vector tables when swapping embedding models with differing vector dimensions (e.g., from Gemini's 3072D to Qwen's 4096D). It acts as a critical fail-safe utility for any future LLM environment migrations across the ecosystem.

## Timeline

- 2026-04-06T15:46:03Z @tobiu added the `enhancement` label
- 2026-04-06T15:46:04Z @tobiu added the `ai` label
- 2026-04-06T15:46:16Z @tobiu referenced in commit `9c7e63e` - "feat: Add SQLite Vector Migration Utility Script (#9733)"
- 2026-04-06T15:46:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T15:46:19Z

Script pushed and safely integrated into the buildScripts directory.

- 2026-04-06T15:46:20Z @tobiu closed this issue

