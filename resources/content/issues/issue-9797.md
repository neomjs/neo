---
id: 9797
title: Stabilize Memory Core Inference Config & SQLite Vector Dimensions
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-08T21:07:16Z'
updatedAt: '2026-04-08T23:44:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9797'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T23:44:20Z'
---
# Stabilize Memory Core Inference Config & SQLite Vector Dimensions

### The Problem
During the stabilization of the local `memory-core` inference pipeline, an unseen conflict emerged when migrating from Google's `gemini-embedding-001` to localized models via LM Studio. The SQLite native engine has hardcoded topological boundaries dictating 4096 dimensions. A secondary environment testing the `text-embedding-qwen3-embedding-4b` model (which streams 2560 dimensions) inherently generated a critical schema violation, leading to teardown failures within `rebuildSQLiteVectors.mjs`. Under this stress, we also detected that transport layer logging mechanisms (`console.log`) inside class initialization (like `neural-link/config.template.mjs`) were polluting the `stdio` pipe strictly required for JSON-RPC traffic.

### The Architectural Reality
Neo.mjs is migrating its vector capabilities entirely into the internal engine via `neo-sqlite-vec`. 
Relevant file integrations affected by this task:
- `buildScripts/ai/rebuildSQLiteVectors.mjs`: Central provisioning script where vector collections are born.
- `ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs`: Binds virtual constraints (enforces `aiConfig.vectorDimension` structurally).
- `ai/mcp/server/memory-core/services/lifecycle/InferenceLifecycleService.mjs`: Local engine bootstrap handshake mechanism.
- `ai/mcp/server/neural-link/config.template.mjs`: Global MCP transport surface area.

### Avoided Gold Standards/Traps
1. **Dynamic Schema Mutability Avoided:** We deliberately bypassed building dynamic dimension handling inside `SQLiteVectorManager.mjs`. Adapting to arbitrary incoming vector shapes corrupts the `sqlite-vec` distance search indexing over the application lifecycle. We opted for a strict *Fail Fast* schema paradigm instead of soft degradation.

### Resolution (Golden Path Alignment)
1. **Dimension Safety Probe (Hard Gate):** Integrated an explicit dimensionality probe inside `buildScripts/ai/rebuildSQLiteVectors.mjs`. A dummy `dimension_test` aborts the pipeline (`process.exit(1)`) prior to any mutation if inference outputs diverge from the central 4096D configuration guardrails.
2. **Graceful Inference Checkpoint:** Modified Node.js `fetch` routines querying `/v1/models` in `InferenceLifecycleService.mjs` to operate strictly on AbortSignals (3000ms threshold).
3. **Transport Channel Hygiene:** Segregated all log pollution outside the stdout pipe by shunting standard operational noise to `stderr` across server boot sequences. JSON-RPC maintains isolated channel integrity.

## Timeline

- 2026-04-08T21:07:17Z @tobiu added the `bug` label
- 2026-04-08T21:07:17Z @tobiu added the `ai` label
- 2026-04-08T21:07:17Z @tobiu added the `architecture` label
- 2026-04-08T21:12:44Z @tobiu referenced in commit `dbd7f29` - "feat: Stabilize Memory Core Inference Config & SQLite Vector Dimensions (#9797)"
- 2026-04-08T23:44:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T23:44:18Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ ✦ Issue stabilized and successfully mitigated via `dbd7f298`.
> 
> **Actions Completed:**
> 1. Implemented a rigid Dimension Safety Probe inside `rebuildSQLiteVectors.mjs` to block schema violations on 2560D models.
> 2. Hardened `/v1/models` inference polling inside `InferenceLifecycleService.mjs` with an `AbortSignal`, ensuring elegant fallback behavior.
> 3. Repiped initialization logs to `stderr` in `config.template.mjs` to protect `stdout` JSON-RPC boundaries.
> 
> Resolves #9797.

- 2026-04-08T23:44:20Z @tobiu closed this issue

