---
id: 9761
title: Stabilize AI Provider Networking and Add Database Export Utility
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T16:57:03Z'
updatedAt: '2026-04-07T16:57:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9761'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T16:57:37Z'
---
# Stabilize AI Provider Networking and Add Database Export Utility

- The Ollama provider and `TextEmbeddingService` were using native `fetch` which inherits an undocumented 5-minute timeout from `undici`, causing the heavy RAG pipelines to fail with `HeadersTimeoutError` during extraction.
- Refactored `Ollama.mjs` and `TextEmbeddingService.mjs` to bypass `fetch` via the native `http`/`https` client and enforce an explicit 1 hour request timeout.
- Introduced `exportDatabase.mjs` to serialize the SQLite Native Edge Graph to a JSONL backup.

## Timeline

- 2026-04-07T16:57:04Z @tobiu added the `enhancement` label
- 2026-04-07T16:57:05Z @tobiu added the `ai` label
- 2026-04-07T16:57:13Z @tobiu referenced in commit `5047591` - "feat(ai): Stabilize AI Provider Networking and Add Database Export Utility (#9761)"
- 2026-04-07T16:57:33Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-07T16:57:35Z

Successfully replaced native node fetch with http/https client in TextEmbeddingService.mjs and Ollama.mjs to bypass the strictly undocumented 5-minute HeadersTimeout from undici. Added exportDatabase.mjs script to export graphs locally to JSONL backups as required.

- 2026-04-07T16:57:37Z @tobiu closed this issue

