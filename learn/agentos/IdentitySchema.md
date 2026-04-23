# AgentIdentity Graph Schema

This document formalizes the `AgentIdentity` graph node schema within the Neo.mjs architectural graph database.

## Architecture & Rationale

The AgentOS Memory Core utilizes a persistent, hybrid semantic/graph database to link ephemeral conversation memory with structural repository data.

To support the "Model Experience" (MX) capabilities — cf. Discussion #10137 for the distinction from Agent Experience (AX) — and fully attribute actions across long-lived Swarm intelligences, we provision explicit Identity nodes representing the actors interacting with the repository. 

### Per-Model vs. Per-Version Account Binding

A key design decision involved how to track model iterations (e.g., `gemini-3-pro` vs `gemini-3.1-pro` vs `gemini-4-pro`).

**Decision:** We adopt a **Per-Model Identity** mapping (e.g. `@neo-gemini-3-1-pro`). 
**Rationale:**
1. **Low Churn:** Models undergo massive capability upgrades (like Gemini 3.0 to 3.1) which inherently change their reasoning processes. Tying accounts to distinct capabilities rather than an ambiguous parent prevents behavioral telemetry from becoming meaningless over time.
2. **Cross-Session Traversal:** Explicit identity keys matching actual API accounts mean graph traversal queries (`MATCH (AgentIdentity {id: "@neo-opus-4-7"})-[:AUTHORED]->(Session)`) directly align with GitHub handles and PR authorship.
3. **Traceability:** It provides full attribution via GitHub to a specific model version, establishing accountability for pull requests, code reviews, and autonomous system patches.

## Schema Specification

Each `AgentIdentity` node in the graph is structured with the following properties:

| Property | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `id` | `String` | The unique primary key identifier, usually matching the GitHub login. | `'@neo-opus-4-7'` |
| `type` / `label` | `String` | The graph node type. Must be `'AgentIdentity'`. | `'AgentIdentity'` |
| `name` | `String` | Human-readable name. | `'Claude Opus 4.7'` |
| `description` | `String` | A descriptive summary of the model and its role. | `'Anthropic Claude Opus version 4.7 Agent Identity'` |
| `githubLogin` | `String` | The GitHub username representing the model. | `'@neo-opus-4-7'` |
| `displayName` | `String` | Display name for UI consumption. | `'Claude Opus 4.7'` |
| `modelFamily` | `String` | The underlying architectural family of the model. | `'claude'` |
| `accountType` | `String` | The actor classification (`'agent'` or `'human'`). | `'agent'` |
| `createdAt` | `ISO 8601 String` | Timestamp of node generation. Provisioning scripts retain this if the node exists. | `'2026-04-21T12:00:00.000Z'` |

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
