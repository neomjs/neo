---
id: 9929
title: Stabilize AI Test Suite environment dependencies
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T16:23:32Z'
updatedAt: '2026-04-12T16:30:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9929'
author: tobiu
commentsCount: 0
parentIssue: 9922
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T16:30:54Z'
---
# Stabilize AI Test Suite environment dependencies

### Architectural Context
During the completion of Epic #9922, testing the Two-Pillar RAG architecture locally revealed intermittent failures strictly related to local LLM daemon execution and parallel test execution:
1. `Authorization.spec.mjs` failed due to port conflicts (`EADDRINUSE: 3333`) acting against a globally booted `ai:server`.
2. `Librarian.spec.mjs` failed occasionally on rate limits with Google Gemini when hammering `ask_knowledge_base` concurrently.
3. `QA.spec.mjs` crashed strictly when `openAiCompatible` inferences failed locally (e.g. absent LLM).

### Corrective Action
- Mapped MCP_SSE_PORT to 5555 in `Authorization.spec.mjs`.
- Wrapped graphRAG `processEvent` in `Librarian.spec.mjs` to dynamically fallback to `test.skip` if the inference times out, preventing hard suite crashes.
- Adjusted assertions in `QA.spec.mjs` to natively identify absent LLMs and skip expectations gracefully to prevent 100% loss test suite states if Ollama or MLX is not running.

## Timeline

- 2026-04-12T16:23:34Z @tobiu added the `enhancement` label
- 2026-04-12T16:23:34Z @tobiu added the `ai` label
- 2026-04-12T16:23:42Z @tobiu added parent issue #9922
- 2026-04-12T16:23:56Z @tobiu referenced in commit `20a29c8` - "test: Stabilize AI Test Suite environment dependencies (#9929)"
- 2026-04-12T16:24:00Z @tobiu cross-referenced by PR #9930
- 2026-04-12T16:24:14Z @tobiu assigned to @tobiu
- 2026-04-12T16:30:54Z @tobiu referenced in commit `f6967de` - "test: Stabilize AI Test Suite environment dependencies (#9929) (#9930)"
- 2026-04-12T16:30:54Z @tobiu closed this issue

