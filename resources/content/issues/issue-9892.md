---
id: 9892
title: 'docs: Expand CodebaseOverview with Agent OS internals and DevIndex architecture'
state: OPEN
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-04-11T19:23:01Z'
updatedAt: '2026-04-11T19:29:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9892'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# docs: Expand CodebaseOverview with Agent OS internals and DevIndex architecture

## Context

`CodebaseOverview.md` is the primary onboarding document for AI agents. It's comprehensive for the frontend engine and component system but has significant gaps in the Agent OS internals discovered during Claude Opus 4.6's first deep-read sessions.

## Missing Content

### 1. DevIndex as a Flagship Application

DevIndex is the **only** application showcasing `Neo.core.Base` as a backend runtime. Its service architecture (`Spider.mjs`, `Updater.mjs`, `Storage.mjs`) runs as Node.js singletons, not browser components. This is architecturally significant — it proves Neo's class system works identically in both environments. Currently absent from the Flagship Applications section.

### 2. Bridge Topology

The overview says "Neural Link (WebSocket JSON-RPC)" but doesn't explain the three-party architecture:

```
Bridge Process (Standalone WebSocket Hub)
    ↑                    ↑
    │                    │
Agent MCP Server    App Worker (Browser)
(Node.js client)    (Browser client)
```

This distinction matters because it enables multi-agent concurrent access to the same running application — a core capability for swarm operations.

### 3. Daemon Lifecycle Scripts

`runSandman.mjs` and `runGoldenPath.mjs` are the entry points for offline cognitive maintenance. New agents need to know these are `node buildScripts/ai/runSandman.mjs` invocations, not MCP protocol operations. The overview mentions DreamService abstractly but not these concrete runners.

### 4. Shared MCP Infrastructure

`ai/mcp/ToolService.mjs` is the universal dispatch layer for all 5 MCP servers. Understanding that `callTool()` is the single choke-point across ALL servers is architecturally critical for agents planning interceptors or middleware (e.g., the NL Action Recorder #9889).

### 5. Agent Profiles

`ai/agent/profile/Librarian.mjs` demonstrates the agent subclass pattern with configurable `modelProvider`. The overview doesn't mention that agents have profiles, or that local inference via MLX Server / ML Studio is a first-class deployment target (April 2026).

### 6. ConnectionService Session Awareness

Brief mention that the NL server tracks live App Worker sessions with `appName`, `connectedAt`, console logs, and window topology via `ConnectionService.sessionData`. This is what makes the Neural Link "session-aware."

## A2A Context (Fat Ticket)

### Files to Modify

| File | Change |
|------|--------|
| `learn/guides/fundamentals/CodebaseOverview.md` | Add DevIndex section under Flagship Applications; expand Agent OS section with Bridge topology, daemon scripts, agent profiles, shared ToolService, ConnectionService |

### Scope Boundary

This is a **documentation-only** ticket. No code changes. The prior #9875 (already merged) addressed AI infrastructure *scale and boundaries*. This ticket addresses the *operational internals* that agents need to understand to work effectively with the Agent OS.

## Verification Plan

1. Visual review of the updated document
2. Confirm no duplication with existing content from #9875


## Timeline

- 2026-04-11T19:23:01Z @tobiu added the `documentation` label
- 2026-04-11T19:23:01Z @tobiu added the `ai` label
- 2026-04-11T19:23:16Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-11T19:29:48Z

**Input from Claude Opus 4.6 (Antigravity):**

> ❋ ## Scope Extension: `ask_knowledge_base` in CodebaseOverview
> 
> Connecting dots with #9893 — the CodebaseOverview's "Key Concepts: Query Entry Points" section (line 480) and "When Stuck" section (line 579) both reference `query_documents` exclusively. Neither mentions `ask_knowledge_base`.
> 
> For a ~479k-line platform, this distinction matters operationally:
> 
> - `query_documents` → "Here are 10 relevant files to read" (agent must still read them)
> - `ask_knowledge_base` → "Here is the synthesized answer with citations" (zero file reads needed)
> 
> **Proposed addition to CodebaseOverview:** A brief callout in the "Why This Matters for You" section (line 461) or the "When Stuck" section (line 579):
> 
> > **Ask, Don't Search:** For conceptual questions ("How does reactivity work?", "What is the config system?"), use `ask_knowledge_base` instead of `query_documents`. It synthesizes answers from multiple source files in a single call — essential for getting the top-level perspective in a codebase of this scale.
> 
> This should be included in the #9892 implementation scope alongside the DevIndex and Agent OS internals additions.


