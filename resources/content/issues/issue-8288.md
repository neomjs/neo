---
id: 8288
title: 'Neo Agent OS: Orchestration & Swarm Architecture'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-01-03T08:03:39Z'
updatedAt: '2026-01-03T08:03:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8288'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Neo Agent OS: Orchestration & Swarm Architecture

This epic tracks the architectural exploration and implementation of the **Neo Agent OS**, a Node.js-based runtime for autonomous AI agent swarms.

**Core Concepts:**
1.  **The Orchestrator:** A persistent Node.js loop that manages the lifecycle of autonomous agents (PM, Dev, QA) and replaces the human-in-the-loop for standard tasks.
2.  **Context Graph:** A structured state model (Nodes/Edges) representing the project reality (Tickets, Files, Concepts, Agents), allowing agents to share a "Shared Brain" and avoid context window overflows.
3.  **Decision Trees:** The "Standard Operating Procedures" (SOPs) or algorithms that define legal transitions and fallback logic for agents (e.g., "If tests fail 3 times, escalate").
4.  **Swarm Intelligence:** The collective behavior emerging from specialized agents (e.g., "Night Watchman" for releases, "Bug Hunter" for regressions) working via the Context Graph.

**Architecture:**
-   **Runtime:** Node.js (Persistent, distinct from the transient Browser App).
-   **Bridge:** Neural Link (WSS) for controlling Neo.mjs Apps.
-   **Memory:** Neo Memory Core for long-term state and session summaries.
-   **Interface:** MCP for tool access.

**Goals:**
-   Define the `supervisor.mjs` prototype (The "Night Watchman").
-   Design the JSON schema for the Context Graph.
-   Implement the first "Decision Node" logic (e.g., simplistic Release automation).


## Timeline

- 2026-01-03T08:03:41Z @tobiu added the `epic` label
- 2026-01-03T08:03:41Z @tobiu added the `ai` label
- 2026-01-03T08:03:41Z @tobiu added the `architecture` label

