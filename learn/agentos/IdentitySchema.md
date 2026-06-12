# AgentIdentity Graph Schema

This document formalizes the `AgentIdentity` graph node schema within the Neo.mjs architectural graph database.

## Architecture & Rationale

The AgentOS Memory Core utilizes a persistent, hybrid semantic/graph database to link ephemeral conversation memory with structural repository data.

To support the "Model Experience" (MX) capabilities — cf. Discussion #10137 for the distinction from Agent Experience (AX) — and fully attribute actions across long-lived Swarm intelligences, we provision explicit Identity nodes representing the actors interacting with the repository.

### Per-Model vs. Per-Version Account Binding

A key design decision involved how to track model iterations (e.g., `gemini-3-pro` vs `gemini-3.1-pro` vs `gemini-4-pro`).

**Decision:** We adopt a **Per-Model Identity** mapping (e.g. `@neo-gemini-pro`).
**Rationale:**
1. **Low Churn:** Models undergo massive capability upgrades (like Gemini 3.0 to 3.1) which inherently change their reasoning processes. Tying accounts to distinct capabilities rather than an ambiguous parent prevents behavioral telemetry from becoming meaningless over time.
2. **Cross-Session Traversal:** Explicit identity keys matching actual API accounts mean graph traversal queries (`MATCH (AgentIdentity {id: "@neo-opus-ada"})-[:AUTHORED]->(Session)`) directly align with GitHub handles and PR authorship.
3. **Traceability:** It provides full attribution via GitHub to a specific model version, establishing accountability for pull requests, code reviews, and autonomous system patches.

## Schema Specification

Each `AgentIdentity` node in the graph is structured with the following properties:

| Property | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `id` | `String` | The unique primary key identifier, usually matching the GitHub login. | `'@neo-opus-ada'` |
| `type` / `label` | `String` | The graph node type. Must be `'AgentIdentity'`. | `'AgentIdentity'` |
| `name` | `String` | Human-readable name. | `'Neo Opus Ada'` |
| `description` | `String` | A descriptive summary of the model and its role. | `'Anthropic Claude Opus version 4.7 Agent Identity'` |
| `githubLogin` | `String` | The GitHub username representing the model. | `'@neo-opus-ada'` |
| `displayName` | `String` | Display name for UI consumption. | `'Neo Opus Ada'` |
| `modelFamily` | `String` | The underlying architectural family of the model. | `'claude'` |
| `accountType` | `String` | The actor classification (`'agent'` or `'human'`). | `'agent'` |
| `createdAt` | `ISO 8601 String` | Timestamp of node generation. Provisioning scripts retain this if the node exists. | `'2026-04-21T12:00:00.000Z'` |

## Capability Fields (Extended per ADR 0012)

Beyond the core identity fields above, `AgentIdentity` nodes carry capability-bearing properties that inform swarm-routing decisions, training-drift defense, and sunset/promotion lifecycle. The full framework lives in [ADR 0012: Model-Stats Framework](decisions/0012-model-stats-framework.md); per-model values live in the live registry at [ModelStats.md](ModelStats.md).

These fields are populated at provisioning time (via `ai/scripts/seedAgentIdentities.mjs`) and updated per ADR 0012 §2.5 registry-update discipline (authoritative-source-cite required).

| Property | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `contextWindowInput` | `Number` (tokens) | Maximum input token capacity. | `1048576` |
| `contextWindowOutput` | `Number` (tokens, optional) | Output token capacity where distinct from input. | `65536` (Gemini 3.1 Pro) |
| `parallelToolCalls` | `Boolean` \| `Number` | Whether parallel tool invocation is supported; numeric value indicates max concurrency where bounded. | `true` |
| `thoughtBudget` | `String` | Reasoning/thinking-budget setting in active use (per-provider terminology). Cross-family comparable at coarse "closer ball park" granularity; exact equivalences require empirical V-B-A. | `'max'` (Claude), `'high'` (Gemini cap), `'extra-high'` (GPT) |
| `hosting` | `String` | Where the model executes: `'cloud'` \| `'mlx-local'` \| `'self-hosted'`. Informs latency, cost, and privacy substrate. | `'cloud'` |
| `tier` | `String` | Capability-cost tier: `'frontier'` \| `'balanced'` \| `'fast'`. Informs swarm-routing policy per ADR 0012 §2.4. | `'frontier'` |
| `releaseDate` | `ISO 8601 String` | Model release date. Anchors capability claims against training-data drift. | `'2026-04-16'` |
| `pricingInput` | `Number` (USD per 1M tokens, optional) | Cost dimension for cloud-hosted models. | `5.00` |
| `pricingOutput` | `Number` (USD per 1M tokens, optional) | Cost dimension for cloud-hosted models. | `25.00` |
| `license` | `String` (optional) | License identifier for open-weights models. | `'Apache-2.0'` (Gemma 4) |
| `benchmarkSnapshot` | `Object` (optional) | Latest benchmark scores for capability-trend tracking. | `{ 'SWE-bench': 0.876 }` |
| `sunsetTriggers` | `String[]` | Conditions under which this identity transitions to deprecated state per ADR 0012 §2.3. | `['Anthropic releases Opus 4.8+']` |
| `swarmRole` | `String` (optional) | Current or aspirational role in the swarm. Aspirational roles require V-B-A measurement before substrate-codification per ADR 0012 §2.4. | `'cross-family substrate review'` |

`modelFamily` (declared above) is the family identifier consumed by the registry's `family` field — both surface the same conceptual property; `modelFamily` is the graph-node primary, `family` is the registry-side mirror.

**Update discipline:** Capability values that change post-provisioning (e.g., Anthropic releases a context-window upgrade for an existing identity) update via `ModelStats.md` first; the graph node is reseeded via `ai/scripts/seedAgentIdentities.mjs` to reflect.

## Ingestion Mechanism

Agent identities are seeded idempotently into the native graph using the `ai/scripts/seedAgentIdentities.mjs` utility. The script interacts with the `Memory_GraphService` to upsert nodes, taking care to preserve the original `createdAt` timestamp if updating existing properties.

**Usage:**
```bash
node ai/scripts/seedAgentIdentities.mjs
```

## Test Pollution Hazard

**The Incident:** On 2026-04-22 (session `15852d91`) and 2026-04-23 (session `8968b9f6`), the production `AgentIdentity` nodes were wiped. This was traced back to a test-pollution anti-pattern in the Playwright test suite.

**The Mechanism:** Tests like `MailboxService.spec.mjs` and `PermissionService.spec.mjs` attempt to isolate themselves using an in-memory database override (`aiConfig.storagePaths.graph = ':memory:';`). However, if `LifecycleService._initPromise` is already set (because a prior test initialized the `LifecycleService` with the default production SQLite path), the `:memory:` override is silently ignored. When the test's `beforeEach` hook then executes `storage.clear()`, it wipes the production data instead of the intended in-memory database.

**The Safer Pattern:** Other specs (e.g., `DreamService`, `SemanticGraphExtractor`) use concrete `testDbPath` temporary files per test. This provides a robust isolation boundary and eliminates the leak surface.

**Recovery Procedure:** If you find the identities missing (often manifesting as identity unbound errors or `null` mailbox previews), run the `ai/scripts/seedAgentIdentities.mjs` script. If the root cause was test pollution, please file a ticket to refactor the offending specs to the concrete temporary file pattern.
