---
id: 9559
title: Design and Implement Authorization for Neural Link MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - performance
  - needs-re-triage
  - not-code-ready
assignees: []
createdAt: '2026-03-26T13:39:22Z'
updatedAt: '2026-06-23T03:23:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9559'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-23T03:23:47Z'
---
# Design and Implement Authorization for Neural Link MCP Server

Establish a secure authorization mechanism for the Neural Link bridge.

As the bridge to the live browser environment, the Neural Link requires a more robust security model to ensure that only authorized agents can manipulate the UI. This task is more complex than the data servers due to its unique architecture and the "Physical Gap" it bridges.

**Scope:**
- Research the best security model for the Neural Link (e.g., local token exchange, signed requests).
- Implement authorization for the `neural-link` MCP server and the underlying bridge connection.

## Timeline

- 2026-03-26T13:39:24Z @tobiu added the `enhancement` label
- 2026-03-26T13:39:24Z @tobiu added the `ai` label
- 2026-03-26T13:39:25Z @tobiu added the `architecture` label
- 2026-03-26T13:39:25Z @tobiu added the `performance` label
- 2026-06-15T17:34:02Z @neo-opus-vega cross-referenced by #13012
- 2026-06-15T17:50:16Z @neo-opus-grace cross-referenced by #13373
- 2026-06-21T10:56:01Z @neo-opus-vega cross-referenced by #13750
- 2026-06-23T03:23:22Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:23:22Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T03:23:36Z

[ARCH_ALIGNMENT]

Ticket-intake verdict: **superseded / not a current implementation lane**.

Evidence checked on 2026-06-23:

- #9559 is still open, unassigned, and unchanged since `2026-03-26T13:39:22Z`. Its body is a broad research+implementation prompt for Neural Link authorization, not a current contract ledger.
- The live successor authority is #13056, **Extended-NL coordination: identity, locking, curated tool surface**. It decomposes the same risk into transport identity, write coordination, and tool-surface curation after the harness/product-surface shift.
- The underlying Bridge-auth half has already landed under #13172 / PR #13181:
  - `ai/mcp/server/neural-link/Bridge.mjs` imports `verifyBridgeToken`, reads the presented `token`, and when `NEO_FLEET_BRIDGE_PUBLIC_KEY` is configured rejects agent connections with close code `1008` on invalid/missing token.
  - `ai/mcp/server/neural-link/verifyBridgeToken.mjs` verifies the Ed25519-signed payload and returns the signed `agentId`; identity no longer depends on the untrusted `?id=` query claim in fleet mode.
- Spawn/projection provisioning also moved into the Extended-NL family:
  - `ai/services/fleet/FleetLifecycleService.mjs` mints and injects `NEO_FLEET_BRIDGE_TOKEN` for spawned agents and pins `NEO_NL_TOOL_PROJECTION_MODE` to `harness-embedded`.
  - `ai/mcp/server/neural-link/mcp-server.mjs` reads `--tool-projection-mode` with `NEO_NL_TOOL_PROJECTION_MODE` as fallback.
  - `ai/mcp/server/neural-link/openapi.yaml` carries the `x-neo-harness-tool-projection` contract and per-operation `x-neo-tool-tier` metadata from the #13064/#13082/#13106 line.
- `ask_knowledge_base` still reports #9559 as open but identifies #13121/#13065/#13064-class mechanisms as the later closed implementation family. Memory Core had no additional prior-session mapping for this exact #9559 framing.

I am closing #9559 as superseded / not planned rather than claiming it. Any remaining Neural Link authorization work should continue through #13056 and its leaf tickets, where the current topology and contract boundaries are already explicit.

- 2026-06-23T03:23:47Z @neo-gpt closed this issue

