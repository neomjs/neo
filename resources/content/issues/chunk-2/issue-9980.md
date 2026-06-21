---
id: 9980
title: Architect MCP Capability Gating by Model Tier
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - neo-opus-vega
createdAt: '2026-04-13T17:17:15Z'
updatedAt: '2026-06-21T10:04:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9980'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 13745 MCP tool-level allowlist mechanism (Agent.allowedTools) — slice of #9980'
subIssuesCompleted: 1
subIssuesTotal: 1
contentTrust:
  projected: true
  quarantined: 0
  signals: []
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
- 2026-06-21T09:40:54Z @neo-opus-vega assigned to @neo-opus-vega
- 2026-06-21T09:54:49Z @neo-gpt cross-referenced by #13744
- 2026-06-21T10:00:20Z @neo-opus-vega cross-referenced by #13745
- 2026-06-21T10:00:35Z @neo-opus-vega added sub-issue #13745
- 2026-06-21T10:01:08Z @neo-opus-vega referenced in commit `0b28e14` - "feat(ai): tool-level MCP capability-gating mechanism (#13745)

Agent profiles select MCP servers all-or-nothing (Agent.servers); the Loop
exposes every tool of every connected client to the model. Add an optional
per-server `allowedTools` allowlist so a profile can expose only a subset of
a server's tools — e.g. limiting a local lower-parameter worker to a single
trap endpoint — enforced at tool-assembly via the pure resolveAllowedTools
filter. Default null = no filtering (backward-compatible).

Slice of #9980 (the tier-to-tool policy matrix stays open for
design-convergence); this is the enabling mechanism only."
- 2026-06-21T10:02:14Z @neo-opus-vega cross-referenced by PR #13747
### @neo-opus-vega - 2026-06-21T10:04:39Z

## Mechanism slice shipped — policy-matrix remains open here

Picked this up (V-B-A'd live: unassigned 2mo, no prior PRs/code). Split into the enabling **mechanism** vs. the high-blast **policy**, per the proven #9962 pure-slice carve:

- **Mechanism (DONE):** #13745 → PR #13747. `Agent.allowedTools` per-server allowlist `{[serverName]: String[]}`, enforced by a pure `resolveAllowedTools` filter at the `Loop` tool-assembly. A profile can now expose only a subset of a connected server's tools (e.g. a local Gemma worker limited to `signal_state_transition`). Backward-compatible (default null). Gated-out tools aren't even registered in `toolRegistry`.

- **Policy (OPEN — this ticket):** the tier→tool **matrix** itself — which concrete tools each model tier gets, wired into the real profiles (`Librarian` etc.) + the orchestrator that selects a tier. This is the "by Model Tier" core of #9980 and is high-blast security policy (deny-by-default vs fail-open-per-server). The mechanism supports either; the matrix is a design-convergence decision, not a unilateral build. Leaving #9980 open and assigned for that work.

Enforcement point chosen: `Loop.initAsync` tool-assembly (the single place all client tools are collected). Alternative considered — filtering at the `Client` layer — deferred; the Loop is where the model-facing tool list is actually built.

- 2026-06-21T10:16:40Z @tobiu referenced in commit `dc896cc` - "feat(ai): tool-level MCP capability-gating mechanism (#13745) (#13747)

Agent profiles select MCP servers all-or-nothing (Agent.servers); the Loop
exposes every tool of every connected client to the model. Add an optional
per-server `allowedTools` allowlist so a profile can expose only a subset of
a server's tools — e.g. limiting a local lower-parameter worker to a single
trap endpoint — enforced at tool-assembly via the pure resolveAllowedTools
filter. Default null = no filtering (backward-compatible).

Slice of #9980 (the tier-to-tool policy matrix stays open for
design-convergence); this is the enabling mechanism only."

