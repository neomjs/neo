---
id: 9683
title: 'Epic Sub: Session Amnesia & The Context Priming Engine'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T11:39:41Z'
updatedAt: '2026-04-04T12:13:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9683'
author: tobiu
commentsCount: 1
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T12:13:10Z'
---
# Epic Sub: Session Amnesia & The Context Priming Engine

# Epic Sub: Session Amnesia & The Context Priming Engine

## Problem
Currently, autonomous agents suffer from "Session Amnesia". When a new session boots, the agent's context window is wiped. While the semantic vector database (ChromaDB) holds all knowledge, the agent does not intrinsically know *what* to query upon waking up, making it dependent on manual user prompting to reload the "Golden Path" strategic context. 

## Proposed Solution
Build the **Context Priming Engine** using the Native Edge Graph.
The true purpose of the native SQLite graph within the Memory Core is to act as an "Active State Topology". 

1. **The Frontier Node:** Maintain a specific graph pointer for the `[Current Frontier]` (the active Epic or task).
2. **Weighted Edges:** Allow the offline Dream Mode (REM) to parse past sessions, create high-priority strategic concept nodes (e.g., `[Concept: Golden Path]`), and explicitly link them to the Frontier with heavy numerical weights.
3. **The Pre-load Injection:** When an agent session initializes, the Memory Core natively traverses 2 degrees outwards from the `[Current Frontier]` node, grabs the highest-weighted semantic pointers, and pushes the associated ChromaDB chunks directly into the agent's startup context. 

## Definition of Done
- The `memory-core` MCP Server exposes a native `getContextFrontier()` (or similar) initialization hook.
- Strategic context (priorities, the "Golden Path") is pre-loaded into new agent sessions without requiring a manual user semantic prompt.
- The Agent wakes up aware of its long-term strategic agenda.

## Timeline

- 2026-04-04T11:39:41Z @tobiu assigned to @tobiu
- 2026-04-04T11:39:42Z @tobiu added the `epic` label
- 2026-04-04T11:39:42Z @tobiu added the `ai` label
- 2026-04-04T11:39:43Z @tobiu added the `architecture` label
- 2026-04-04T11:39:49Z @tobiu added parent issue #9673
- 2026-04-04T12:12:26Z @tobiu referenced in commit `5644dc4` - "feat(ai): Implement Context Priming Engine (Fully Hybrid Architecture) (#9683)"
- 2026-04-04T12:12:26Z @tobiu referenced in commit `168dbb1` - "docs: Update AGENTS_STARTUP to call get_context_frontier (#9683)"
### @tobiu - 2026-04-04T12:13:02Z

**Input from Gemini 2.5 Pro (Antigravity):**

> ✦ The Context Priming Engine has been successfully implemented. 
> 
> We bridged the Native Edge Graph with the semantic ChromaDB vectors. The `get_context_frontier()` tool has been verified and integrated into `AGENTS_STARTUP.md` as part of the mandatory boot sequence to eradicate Session Amnesia. 
> 
> Future sessions will automatically wake up inherently aware of the project's long-term strategic agenda. The task is fully complete.

- 2026-04-04T12:13:11Z @tobiu closed this issue

