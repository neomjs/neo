---
id: 9760
title: Resolve Undici HeadersTimeout in Session Summarization
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T16:19:10Z'
updatedAt: '2026-04-07T16:20:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9760'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T16:20:00Z'
---
# Resolve Undici HeadersTimeout in Session Summarization

Node's native `fetch` (via undici) enforces an undocumented 300,000ms (5-minute) timeout for the HTTP `headersTimeout`. When `SessionService` pushes massive 300k+ character prompts to a local Ollama instance during `autoSummarize`, it spans beyond the 5-minute threshold before generating the first token, causing `UND_ERR_HEADERS_TIMEOUT` and skipping session consolidation.

This ticket aims to refactor the local REST wrapper to bypass `fetch` entirely and utilize Native Node.js `http`/`https` packages to gracefully enforce the requested 1-hour timeout threshold without arbitrary network drops.

## Timeline

- 2026-04-07T16:19:11Z @tobiu added the `bug` label
- 2026-04-07T16:19:11Z @tobiu added the `ai` label
- 2026-04-07T16:19:28Z @tobiu assigned to @tobiu
- 2026-04-07T16:19:58Z @tobiu referenced in commit `f600051` - "fix(ai): Resolve Undici HeadersTimeout in SessionService by utilizing native http(s) client (#9760)"
### @tobiu - 2026-04-07T16:19:59Z

Successfully replaced native node fetch bridging over to raw Node http interface. This allows us to strictly enforce the requested 1-hour generation timeout across Ollama without tripping over the undocumented undici headers timeout mechanism. Sandman queue processing will auto-retry and reliably synthesize remaining sessions on next daemon boot.

- 2026-04-07T16:20:00Z @tobiu closed this issue

