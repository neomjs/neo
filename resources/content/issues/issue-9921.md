---
id: 9921
title: 'fix(ai): Resolve local inference 4096 n_ctx Exhaustion During Session Summarization'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T13:25:35Z'
updatedAt: '2026-04-13T22:32:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9921'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9954 Epic: The Self-Healing Protocol'
closedAt: '2026-04-13T11:54:40Z'
---
# fix(ai): Resolve local inference 4096 n_ctx Exhaustion During Session Summarization

### Description
The `mcp_neo-mjs-memory-core_summarize_sessions` tool routinely crashes internally with the local inference daemon error: `The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 5382 >= n_ctx: 4096)`. 

This indicates that as `Neo.ai.Agent` reasoning loops expand during heavily contextual RLAIF sessions (due to increased swarm intelligence and tool use), the final session summarization pipeline strictly drops the payload and fails to index the session.

### Architectural Rationale
- The underlying backend (e.g., MLX / `openAiCompatible`) currently defaults to a context limit of 4096 tokens when hosting `gemma4:31b` or similar local models.
- We must either explicitly bump this `n_ctx` limit at the deployment daemon layer (e.g., updating Python boot args to `8192`), or we must instruct the `memory-core` MCP Server to truncate/chunk the combined `prompt + thought + response` strings *before* throwing the batch at the extraction endpoint.
- **A2A Context:** Failure to resolve this natively prevents the most complex agent problem-solving sessions from being squashed into Vector Summaries. Consequently, the Swarm loses immediate visibility to precisely the problems it struggled with the most.

***
**Origin Session ID:** 95bf4a2b-d84e-4f70-945b-f558ba924d3a

## Timeline

- 2026-04-12T13:25:37Z @tobiu added the `bug` label
- 2026-04-12T13:25:37Z @tobiu added the `ai` label
- 2026-04-13T11:13:31Z @tobiu marked this issue as blocking #9954
- 2026-04-13T11:43:17Z @tobiu referenced in commit `002d2f0` - "fix(MemoryCore): Resolve local MLX n_ctx exhaustion by truncating tail-end session documents (#9921)"
- 2026-04-13T11:43:31Z @tobiu cross-referenced by PR #9964
- 2026-04-13T11:53:13Z @tobiu cross-referenced by #9965
- 2026-04-13T11:54:40Z @tobiu referenced in commit `c4a9eda` - "fix(MemoryCore): Resolve local MLX n_ctx exhaustion by truncating tail-end session documents (#9921) (#9964)"
- 2026-04-13T11:54:40Z @tobiu closed this issue
- 2026-04-13T11:58:45Z @tobiu cross-referenced by PR #9966
- 2026-04-13T22:32:57Z @tobiu assigned to @tobiu

