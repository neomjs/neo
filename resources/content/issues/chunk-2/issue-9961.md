---
id: 9961
title: Pre-Task Retrospective Query — Active Memory Consumption
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-13T11:13:08Z'
updatedAt: '2026-04-13T11:13:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9961'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[ ] 9959 fix: Memory Core semantic search crash & active session summarization leak'
blocking: []
---
# Pre-Task Retrospective Query — Active Memory Consumption

### Problem

The Memory Core stores 7,789+ episodic memories and 740+ session summaries, but no agent is mandated to **query its own failure history** before starting work on a ticket. Memory exists as a passive archive, not an active learning signal.

This means agents routinely repeat mistakes that were already encountered and solved in prior sessions. The memory system has the data — it's just not being consumed at the point where it matters most: **task initialization**.

### Proposal

Add a mandatory **Pre-Task Retrospective Query** to the agent startup sequence. When an agent picks up a ticket (via `AGENTS_STARTUP.md` or the future Dispatcher), it MUST:

1. Extract the ticket's semantic context (title, labels, related graph nodes)
2. Execute `query_raw_memories` with that context to surface past failures, approaches, and decisions
3. Execute `query_summaries` to find related session arcs
4. Synthesize a "lessons learned" brief before writing any code

### Implementation Options

**Option A (Prompt-Level):** Add a mandatory step to `AGENTS_STARTUP.md` that instructs frontier models (Gemini/Claude) to query memory before beginning implementation. Zero code change required, but relies on model compliance.

**Option B (MCP-Level):** Create a `pre_task_brief` MCP tool in the memory-core server that accepts a ticket number/description and automatically returns:
- Top 3 relevant past failures from `query_raw_memories`
- Top 2 related session summaries from `query_summaries`
- Any `[KB_GAP]` or `[TOOLING_GAP]` tags from prior PR reviews

Option B is preferable — it's deterministic, token-efficient (single tool call vs. multiple), and works for both frontier models and sub-agents.

### Expected Impact

- Reduced repeat failures across sessions
- Faster ramp-up time for agents picking up tickets
- First genuine "learning from experience" behavior in the feedback loop

### A2A Context
Origin Session ID: `fff6dc5b-ca7f-4c9b-8eca-41bd8a97ad5d`

## Timeline

- 2026-04-13T11:13:09Z @tobiu assigned to @tobiu
- 2026-04-13T11:13:11Z @tobiu added the `enhancement` label
- 2026-04-13T11:13:11Z @tobiu added the `ai` label
- 2026-04-13T11:13:12Z @tobiu added the `architecture` label
- 2026-04-13T11:13:37Z @tobiu marked this issue as being blocked by #9959

