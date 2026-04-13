---
id: 9973
title: Triage Memory Core `summarize_sessions` Token Exhaustion (n_ctx 4096 Error)
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-04-13T13:51:02Z'
updatedAt: '2026-04-13T13:51:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9973'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Triage Memory Core `summarize_sessions` Token Exhaustion (n_ctx 4096 Error)

### Architectural Paradox
While we successfully truncated payload extraction for `DreamService.mjs` native topological generation, the direct MCP boundary `summarize_sessions` continues to crash when long-running sessions exceed the strict 4096 context window of the local `OpenAiCompatible` MLX engine.

**Error Signature:**
`error executing cascade step: CORTEX_STEP_TYPE_MCP_TOOL: Tool Error: Session summarization failed. Message: OpenAiCompatible Status 400: {"error":"The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 80566>= n_ctx: 4096). Try to load the model with a larger context length, or provide a shorter input."}`

### Telemetry Payload
- **Origin Session ID:** ce92f035-b064-457e-be12-aad58dcffb53
- **Failed Tool:** `mcp_neo-mjs-memory-core_summarize_sessions`

### Expected Resolution
Refactor the `summarize_sessions` logic within `memory-core` to inject the same "Final 3 Tuples Truncation" algorithm executed by `DreamService` to assure chunked processing safely passes MLX boundaries without exceeding `n_ctx`.

## Timeline

- 2026-04-13T13:51:03Z @tobiu added the `bug` label
- 2026-04-13T13:51:04Z @tobiu added the `ai` label

