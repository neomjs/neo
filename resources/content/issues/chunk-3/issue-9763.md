---
id: 9763
title: Migrate DreamService to MLX-Native OpenAI-Compatible Server
state: CLOSED
labels:
  - enhancement
  - ai
  - 'agent-role:dev'
  - performance
assignees:
  - tobiu
createdAt: '2026-04-07T19:57:55Z'
updatedAt: '2026-04-07T23:03:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9763'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T20:01:23Z'
---
# Migrate DreamService to MLX-Native OpenAI-Compatible Server

Currently, the autonomous REM sleep pipeline (`DreamService.mjs`) uses the `Ollama` provider. Calculating `num_ctx` dynamically for a 31B model creates massive memory bandwidth saturation and forces frequent KV cache resizing, resulting in monumental prefill IO overhead on Apple Silicon M-series chips. 

**Scope:**
1. Create a generic `OpenAiCompatible.mjs` provider inside `src/ai/provider/`.
2. Refactor `DreamService.mjs` to target this new provider instead of Ollama, abandoning individual `num_ctx` manipulations and deferring dynamic KV-Cache paging to MLX.
3. Add API connection settings to `config.mjs`.

## Timeline

- 2026-04-07T19:57:57Z @tobiu added the `enhancement` label
- 2026-04-07T19:57:57Z @tobiu added the `ai` label
- 2026-04-07T19:57:57Z @tobiu added the `agent-role:dev` label
- 2026-04-07T19:57:58Z @tobiu added the `performance` label
- 2026-04-07T20:00:53Z @tobiu referenced in commit `0e315c4` - "feat: Migrate DreamService to MLX-Native OpenAI-Compatible Server (#9763)

- Implemented OpenAiCompatible API provider to replace Ollama
- Removed manual num_ctx parameter injections to allow MLX native KV cache paging
- Adjusted configuration settings and error handling logs"
### @tobiu - 2026-04-07T20:01:20Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ **Task Completed!**
> 
> The autonomous infrastructure migration to native MLX support is finished. 
> 
> **Summary of Modifications:**
> 1. A new `OpenAiCompatible.mjs` API provider adapter has been implemented which binds specifically to `/v1/chat/completions` API JSON structures.
> 2. `num_ctx` logic has been surgically stripped from all `DreamService.mjs` execution loops (Tri-Vector Synthesis, Topology Conflict Reconciliation, Capability Gap Extraction).
> 3. KV-cache management has effectively been handed back over to Apple Native Paged Attention structures.
> 
> > **Note:** The server expects the runner (such as `mlx_lm.server`) to exist on port `:8000` via the new `openAiCompatible` config setting.
> 
> Code has been committed and physically pushed to the active development branch. I am proceeding to close this ticket structurallly.

- 2026-04-07T20:01:23Z @tobiu closed this issue
- 2026-04-07T23:03:45Z @tobiu assigned to @tobiu

