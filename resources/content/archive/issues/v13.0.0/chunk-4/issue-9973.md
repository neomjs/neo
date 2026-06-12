---
id: 9973
title: Triage Memory Core `summarize_sessions` Token Exhaustion (n_ctx 4096 Error)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T13:51:02Z'
updatedAt: '2026-04-13T15:42:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9973'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T14:46:47Z'
---
# Triage Memory Core `summarize_sessions` Token Exhaustion (n_ctx 4096 Error)

### Architectural Paradox
While we successfully truncated payload extraction for `DreamService.mjs` native topological generation, the direct MCP boundary `summarize_sessions` continues to crash when long-running sessions exceed the strict 4096 context window of the local `OpenAiCompatible` MLX engine.

**Error Signature:**
`error executing cascade step: CORTEX_STEP_TYPE_MCP_TOOL: Tool Error: Session summarization failed. Message: OpenAiCompatible Status 400: {"error":"The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 80566>= n_ctx: 4096). Try to load the model with a larger context length, or provide a shorter input."}`

### Telemetry Payload
- **Origin Session ID:** ce92f035-b064-457e-be12-aad58dcffb53
- **Failed Tool:** `mcp_neo-mjs-memory-core_summarize_sessions`

### Final Resolution (Executed)
**Rejected Initial Hypothesis:** We specifically rejected the "Final 3 Tuples Truncation" mechanism for `SessionService`, as it would result in unacceptable architectural amnesia during summarization (negative ROI). The Map-Reduce logic was fundamentally sound and designed explicitly to preserve lossless memory.

**Root Cause Analyzed:** The 80k+ token explosion was tracked to `add_memory` schema trust boundaries. Autonomous LLM agents were occasionally serializing multi-kilobyte script mutations and injecting them into the `toolsUsed` array under the `AddMemoryRequest` schema. This bypassed the Map-Reduce content splitting, appending gigabytes of file dumps unconditionally into the preamble.

**Architectural Fix:** 
1. `SessionService.mjs` was refactored with defensive programming: we strictly parse, cast, and aggressively truncate (to 50 chars) all variables feeding `toolsUsed` from the metadata before joining them into the prompt preamble.
2. We added comprehensive unit coverage mocking 50K payload bombs (`SessionSummarization.spec.mjs`) to validate defensive extraction. 
3. `openapi.yaml` was re-authored to explicitly ban JSON payloads in the `toolsUsed` property, restricting agents to single-word identifiers.

## Timeline

- 2026-04-13T13:51:03Z @tobiu added the `bug` label
- 2026-04-13T13:51:04Z @tobiu added the `ai` label
- 2026-04-13T14:36:08Z @tobiu referenced in commit `820a447` - "fix: harden SessionService against toolsUsed payload explosion (#9973)"
- 2026-04-13T14:36:11Z @tobiu cross-referenced by PR #9974
- 2026-04-13T14:43:34Z @tobiu assigned to @tobiu
- 2026-04-13T14:46:48Z @tobiu referenced in commit `cd0a834` - "fix: harden SessionService against toolsUsed payload explosion (#9973) (#9974)"
- 2026-04-13T14:46:48Z @tobiu closed this issue

