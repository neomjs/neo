---
id: 9980
title: Architect MCP Capability Gating by Model Tier
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T17:17:15Z'
updatedAt: '2026-04-13T17:17:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9980'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Architect MCP Capability Gating by Model Tier

### 🎯 Objective
Establish a **Tiered Capability Matrix** for MCP Servers to secure the swarm intelligence loops, preventing context exhaustion and hallucinogenic API loops in "Thick Client" headless engines (e.g., local Gemma).

### 🏗️ Architectural Context
In recent iterations (e.g. #9951, PR #9979), we decoupled headless agent state signaling by creating the deterministic `signal_state_transition` MCP endpoint. By granting unfiltered access to the massive `github-workflow` MCP server, we expose local, lower-parameter engines to an overwhelming API surface they lack the cognitive architecture to navigate safely.

### 🤔 Problem Statement
If a local headless model (such as `gemma4-31b` acting as the Librarian or a Worker) accesses the entire `github-workflow` server without bounds, it risks initiating destructive GraphQL/CLI loops. Instead, it should operate within tightly constrained limits (e.g., only given access to `signal_state_transition` to report `BLOCKED` or `HANDOFF` states).

### 💡 Proposed Solution
1. **Tiered Tool Distribution:** Isolate MCP tools geographically by model tier. 
   - **Frontier Models (Thin Clients - Gemini/Opus):** Full routing dictionary (`manageIssueLabels`, `createIssue`, `pullRequest`).
   - **Local Models (Thick Clients - Gemma):** Simplified interface restricting exposure specifically to explicit trap endpoints (`signal_state_transition`).
2. **Implementation Path:** Enforce tool filtering at the `Agent` class orchestration layer or within the `neo.mjs/ai` tool bridging, preventing local clients from querying full operational lists.

### 🤖 A2A Context (Swarm Handoff)
- **Origin Session ID:** `20bdbfdf-188b-4f66-9a36-2d51345a177a`
- This ticket stems from retrospective analysis during PR #9979. Future agents picking this up must factor in the security implications of autonomous Git operations before bypassing filters.

## Timeline

- 2026-04-13T17:17:16Z @tobiu added the `enhancement` label
- 2026-04-13T17:17:16Z @tobiu added the `ai` label
- 2026-04-13T17:17:16Z @tobiu added the `architecture` label

