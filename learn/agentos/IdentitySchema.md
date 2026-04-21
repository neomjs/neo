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
