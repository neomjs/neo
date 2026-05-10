---
id: 9725
title: Switch Memory Core embedding provider to Gemini and optimize RAG migration
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T21:42:05Z'
updatedAt: '2026-04-05T21:52:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9725'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T21:52:17Z'
---
# Switch Memory Core embedding provider to Gemini and optimize RAG migration

The user reported that the local Ollama LLM is continually bottlenecking the iMac hardware during heavy Memory Core vector processing (e.g. 4-hour migrations and post-turn summaries).
To stabilize the OS architecture, we will offload all vector embedding to the cloud API.

**Objectives:**
1. Update `ai/mcp/server/memory-core/config.mjs` to set `neoEmbeddingProvider` to `gemini` by default.
2. Update `syncMemoryChromaToNeo.mjs` to detect if the source and target embedding providers match. If they do (both Gemini), bypass the entire TextEmbeddingService loop and fetch Chroma's `embeddings` natively, performing a 1:1 instantaneous hardware dump of the vectors into SQLite.
3. Terminate the hanging 4-hour migration script and restart it with the optimized 3-second vector dump protocol.

## Timeline

- 2026-04-05T21:42:10Z @tobiu added the `enhancement` label
- 2026-04-05T21:42:10Z @tobiu added the `ai` label
- 2026-04-05T21:52:12Z @tobiu referenced in commit `11e4d56` - "refactor(MemoryCore): Switch native embedding provider to Gemini and optimize Chroma migration (#9725)"
- 2026-04-05T21:52:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-05T21:52:15Z

Migration strategy successfully refactored to perform instantaneous 1:1 hardware vector transfer from Chroma legacy payload explicitly to SQLite Native tables, bypassing the expensive TextEmbeddingService.

- 2026-04-05T21:52:17Z @tobiu closed this issue

