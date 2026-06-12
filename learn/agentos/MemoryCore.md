# The Memory Core Server

The **Memory Core Server** (`neo.mjs-memory-core`) is the AI agent's "Hippocampus" — its long-term memory center. It acts as a persistent state layer that allows agents to remember past interactions, learn from previous decisions, and maintain context across different development sessions.

## Purpose

Without memory, every session is a blank slate. An agent fixing a bug today has no recollection of the similar bug it fixed last week. The Memory Core solves this by persisting:
*   **Interactions:** Every prompt, thought process, and response is stored as a raw memory.
*   **Decisions:** The reasoning behind *why* a certain approach was chosen.
*   **Summaries:** High-level abstractions of entire work sessions to enable fast retrieval of past experiences.

## Architecture

The server is built on a modular service architecture, extending `Neo.core.Base`. It uses **ChromaDB** as the vector database for semantic search and the configured AI providers for text embeddings and summarization. The Native Edge Graph persists in SQLite via `ai/graph/storage/SQLite.mjs`, which sets `PRAGMA foreign_keys=ON` at connection time so the schema-declared `Edges` `ON DELETE CASCADE` fires on Node deletion (#10856).

### Key Services

*   **`MemoryService`**: Manages raw, granular memories. It handles the ingestion of new agent interactions and performs semantic searches across the raw interaction history.
*   **`SessionService`**: Responsible for the "Auto-Discovery" process. It uses an LLM to analyze completed sessions and generate structured summaries (Title, Category, Quality Scores) to make them easily searchable.
*   **`SummaryService`**: Manages the high-level session summaries. It provides tools to query past work based on topics or categories (e.g., "refactoring", "bugfix").
*   **`DatabaseLifecycleService`**: Reports the underlying ChromaDB process state so health diagnostics can explain whether the persistence layer is available.
*   **`HealthService`**: A gatekeeper that ensures dependencies (ChromaDB connectivity, collections, and provider readiness) are healthy before allowing operations.

## The "Save-Then-Respond" Protocol

The most critical operational rule for the Memory Core is the **Transactional Memory Protocol**.
To ensure a complete history, agents are required to follow a strict loop for every interaction turn:

1.  **Think:** Analyze the user's request.
2.  **Act:** Execute tools and gather information.
3.  **Consolidate:** Formulate the final response.
4.  **Save (`add_memory`):** Persist the *entire* turn (Prompt + Thought + Response) to the database.
5.  **Respond:** Only *after* the save is confirmed, deliver the response to the user.

**Why?** This ensures that the agent's *internal reasoning* (the "Thought") is saved, not just the final output. This is crucial for self-improvement, allowing the agent to analyze its own logic later.

## Session Summarization (Auto-Discovery)

The Memory Core is **self-organizing**.
When the server starts, the `SessionService` automatically scans for previous sessions that haven't been summarized yet. It uses **Gemini 2.5 Flash** to analyze the raw interaction logs and generate a structured summary containing:

*   **Title:** A concise name for the session (e.g., "Fixing Button Click Event").
*   **Category:** One of: `bugfix`, `feature`, `refactoring`, `documentation`, `new-app`, `analysis`, `other`.
*   **Quality Metrics:** Scores (0-100) for **Productivity**, **Complexity**, and **Quality**.
*   **Summary:** A high-level textual overview of what was achieved.
*   **Technologies:** A list of key technologies or modules touched during the session.

This means the agent starts every new session with an indexed "Recap" of its past work, ready to pick up where it left off.

### Session Sunset Polling

To gracefully capture sessions from external harnesses without losing events to isolated per-instance SQLite queues, the Memory Core employs a **B2 Mailbox-Poll** strategy.

The `SessionService` spins up a periodic background poller (every 30s) that queries the A2A Mailbox for unread self-DM messages matching the contract:
`{ taggedConcepts: ['sunset-protocol-handover'] }`

This substrate bridges the gap between instances: when any agent on any clone runs the session-sunset skill, the final self-DM is persisted in the shared graph. The Memory Core sees this unread message, triggers a summarization sweep to ingest the finalized session, and marks the message as read to prevent double-processing.

## Tools

The server exposes a suite of tools via the Model Context Protocol (MCP).

### Memory Operations

*   **`add_memory`**: The core persistence tool. Saves the `{prompt, thought, response}` triplet.
*   **`get_session_memories`**: Retrieves the full chronological history of a specific session. Useful for context recovery.
*   **`query_raw_memories`**: Performs a semantic vector search across *all* raw memories. Use this to find specific details (e.g., "What was the error message in the grid component?").

### Summary Operations

*   **`query_summaries`**: Performs a semantic vector search across session summaries. Use this to find relevant *past sessions* (e.g., "Have I worked on the Grid component before?").
*   **`get_all_summaries`**: Lists all session summaries, sorted by date.
*   **`summarize_sessions`**: Manually triggers the summarization process for specific or all pending sessions.

### Session Operations

*   **`resume_session`**: Pure validation/query — returns structural metadata about whether a candidate session ID is safe for the agent to keep using on reconnect (set the `Mcp-Session-Id` header to that ID for subsequent calls). Does NOT mutate `RequestContextService` or any server-side session state. Returns either a success payload (`status: 'resumable'` plus `memoryCount`, `lastActivityAt`, `summarizationStatus`) or one of four structured errors: `INVALID_SESSION_ID`, `SESSION_NOT_FOUND`, `SESSION_FINALIZED` (already summarized — start fresh), `SESSION_BUSY` (concurrent summarization mid-flight — retry shortly). Use after recovering a candidate session ID from a prior `query_summaries` result or local context.
*   **`set_session_id`**: Legacy / single-tenant fallback only. Overrides the process-global `_legacySessionId`. Rejected with `REQUEST_SCOPED_SESSION_ACTIVE` when invoked under a request-bound `Mcp-Session-Id` context to prevent multi-tenant state corruption. Prefer transport-layer session binding via the `Mcp-Session-Id` header in shared deployments.

### Health & Data Management

*   **`healthcheck`**: Diagnostics tool. Checks ChromaDB status, collection health, API key configuration, identity binding, and effective ChromaDB topology. See **Healthcheck Response Shape** below for the full payload contract.
*   **`export_database`**: Exports memories and summaries to JSONL files for backup.
*   **`import_database`**: Imports data from JSONL backups.

## Healthcheck Response Shape

Operators running `healthcheck` (via MCP, or via the SSE `/healthcheck` endpoint when the server is exposed over HTTP) receive a structured payload covering connectivity, identity, mailbox, multi-tenant migration state, and ChromaDB topology resolution. The shape is stable — new observability blocks are additive, existing blocks are not renamed or reshaped.

```json readonly
{
    "status": "healthy",
    "timestamp": "2026-04-24T10:15:00.000Z",
    "session":  { "currentId": "b02bd06c-..." },
    "database": {
        "process": { "managed": false, "strategy": "external" },
        "connection": {
            "connected": true,
            "engines":   { "chroma": true, "sqlite": false },
            "collections": {
                "memories":  { "name": "neo-agent-memory",   "exists": true, "count": 8599 },
                "summaries": { "name": "neo-agent-sessions", "exists": true, "count": 794 }
            }
        },
        "topology": {
            "mode": "unified",
            "coordinates": { "host": "localhost", "port": 8100 },
            "resolvedVia": "engines.chroma"
        }
    },
    "features": {
        "summarization": true
    },
    "startup":   { "summarizationStatus": "not_attempted", "summarizationDetails": null },
    "mailboxPreview": null,
    "identity":  { "source": "env-var", "bound": true, "nodeId": "@neo-opus-ada" },
    "migration": { "memory": 0, "session": 0, "total": 0, "available": true },
    "providers": {
        "embedding": {
            "active": "openAiCompatible",
            "host": "http://127.0.0.1:8000",
            "model": "text-embedding-qwen3-embedding-1.5b",
            "dimensions": 4096
        },
        "summary": {
            "active": "openAiCompatible",
            "host": "http://127.0.0.1:11434",
            "model": "qwen3-8b",
            "endpoint": "http://127.0.0.1:11434/v1/chat/completions",
            "local": true,
            "credential": {
                "env": "NEO_OPENAI_COMPATIBLE_API_KEY",
                "configured": false,
                "required": false
            }
        }
    },
    "details":   ["Connected to an externally managed ChromaDB instance", "All features are operational"],
    "version":   "1.0.0",
    "uptime":    0.21
}
```

### `database.topology` — Effective ChromaDB Coordinate Resolution

Introduced in #10127. The block surfaces **which ChromaDB instance Memory Core is actually using**, so operators can verify coordinates without inspecting logs or re-running the config through `node -e`.

| Field | Type | Meaning |
|---|---|---|
| `mode` | `'unified'` | Always `'unified'`. Memory Core shares the underlying ChromaDB instance with the KB. |
| `coordinates` | `{host, port} \| null` | The effective `{host, port}` the client is targeting. `null` when `engines.chroma` is missing from config — a misconfig surfaced as observable data rather than a 500. |
| `resolvedVia` | `'engines.chroma'` | The exact config key path the resolver read. Gives operators a direct pointer to what to inspect when coordinates look wrong. |
| `error` | `string` (optional) | Present only when the resolver threw — names the specific misconfig. |

**Why this matters:** The block closes the observability gap in-band by confirming the exact coordinates the Memory Core client is targeting.

### `identity` — Stdio Identity Binding

Introduced in #10176. Surfaces whether the MCP server resolved a concrete AgentIdentity at boot:
- `source`: `'env-var'` (NEO_AGENT_IDENTITY), `'gh-cli'` (authenticated login), or `'unresolved'`.
- `bound`: `true` when the resolved userId matched a seeded AgentIdentity graph node. `false` is a seed-state failure signal — agent needs `ai/scripts/seedAgentIdentities.mjs` or the #10232 boot-time self-seed did not fire.
- `nodeId`: The canonical `@login` AgentIdentity node when bound, `null` otherwise.

### `migration` — Multi-Tenant Migration Progress

Introduced in #10017 (see `learn/agentos/tooling/MultiTenantMigrationGuide.md`). Tracks how many pre-tenant-aware-era nodes remain untagged as natural query patterns lazy-tag data:
- `memory` / `session`: Count of `MEMORY` / `SESSION` label nodes lacking a `userId` property.
- `total`: Sum of the two.
- `available`: `false` if the SQLite graph is not yet mounted (substrate-readiness signal, not a migration error).

A zero `total` is the signal operators watch for to flip the `memorySharing` default from `'legacy'` to `'private'`.

### `providers.embedding` — Active Embedding Model Route

Introduced for Chroma-side local embedding-provider validation (#10723), then consolidated to one provider selector by #10804. The block surfaces the single embedding route used for ChromaDB retrieval:

| Field | Type | Meaning |
|---|---|---|
| `active` | `'gemini' \| 'openAiCompatible' \| 'ollama' \| string` | Provider selected for every embedding consumer. Controlled by `embeddingProvider` / `NEO_EMBEDDING_PROVIDER`. |
| `host` | `string \| null` | Embedding provider host for local providers; `null` for Gemini. |
| `model` | `string \| null` | Configured embedding model name. |
| `dimensions` | `number` | Configured `vectorDimension`; must match the embedding model's actual output dimension. Live output length is provider-call evidence rather than a cheap config projection; Golden Path logs `actualEmbeddingDimension` when it already generated a frontier embedding and detects a mismatch before Chroma query. |
| `error` | `string` (optional) | Present only when the provider key is unrecognized; healthcheck surfaces the misconfig instead of throwing. |

`NEO_CHROMA_EMBEDDING_PROVIDER` remains readable during the #10804 deprecation window and feeds the unified selector with a warning. Operators should use `NEO_EMBEDDING_PROVIDER` for new deployments.

### `providers.summary` — Active Summary Model Route

Introduced for local chat-API provider validation (#10724). The block sits beside `providers.embedding` (#10723) and surfaces which generation provider Memory Core will use for session summaries:

| Field | Type | Meaning |
|---|---|---|
| `active` | `'gemini' \| 'openAiCompatible' \| string` | The active `modelProvider` config value for summarization. |
| `host` | `string \| null` | The chat provider host for OpenAI-compatible APIs; `null` for Gemini. |
| `model` | `string \| null` | The configured generation model (`modelName` for Gemini, `openAiCompatible.model` for OpenAI-compatible chat APIs). |
| `endpoint` | `string \| null` | Chat-completions endpoint for OpenAI-compatible providers; `null` for Gemini. |
| `local` | `boolean` | `true` when the endpoint host is `localhost`, `127.0.0.1`, or `[::1]`. |
| `credential.env` | `string \| null` | Environment variable name operators use for the provider credential. Secret values are never exposed. |
| `credential.configured` | `boolean` | Whether the credential env/config value is present. |
| `credential.required` | `boolean` | Whether Memory Core requires the credential to mark summarization available. |

For Qwen3-8b or another local OpenAI-compatible chat model, set `NEO_MODEL_PROVIDER=openAiCompatible`, `NEO_OPENAI_COMPATIBLE_HOST`, and `NEO_OPENAI_COMPATIBLE_MODEL`, then verify `providers.summary` before relying on disconnect-triggered summaries.

## Two-Stage Query Workflow

Effective agents use the search tools in a "Zoom In / Zoom Out" sequence:

1.  **Stage 1 (Zoom Out):** Use **`query_summaries`** to find a relevant previous session.
    *   *Query:* "Refactoring the virtual list implementation"
    *   *Result:* "Session #42: Grid Virtualization Refactor"
2.  **Stage 2 (Zoom In):** Use **`query_raw_memories`** (optionally filtered by that `sessionId`) to retrieve specific code snippets or decision logic.
    *   *Query:* "Why did I use a Map instead of an Object for item lookup?"
    *   *Result:* Specific thought process from Session #42 explaining the performance benefits.

## Internals: Text Embeddings & ChromaDB

The server uses **ChromaDB** as its embedding store.

*   **`TextEmbeddingService`**: Wraps the `text-embedding-004` model from Google. It converts all text (prompts, thoughts, summaries) into high-dimensional vectors.
*   **`ChromaManager`**: A singleton that manages the connection to ChromaDB. It lazily initializes two collections:
    *   `neo-agent-memory`: Stores the raw interaction logs.
    *   `neo-agent-sessions`: Stores the generated summaries.

## Backup and Restore from Atomic Bundle

The Neo.mjs AI substrate ships two CLI orchestrators for full-substrate snapshots:

| Command | What it does |
|---|---|
| `npm run ai:backup` | Captures KB + MC memories/summaries + MC graph + concepts + RLAIF trajectories + mailbox archive into a single timestamped bundle directory under `.neo-ai-data/backups/backup-<ISO-ts>/`. Writes `bundle-meta.json` with unified topology, KB/MC chroma coordinates, neoVersion, and gitSha. Runs row-count integrity check + retention sweep (keep newest K=3, prune >N=7 days). |
| `npm run ai:restore -- <bundle-path>` | Inverts backup. Reads the bundle, validates structure + JSONL parseability + topology compatibility, then routes each subsystem through the canonical SDK boundary in `ai/services.mjs`. |

### Restore semantics

The restore CLI accepts the following flags:

| Flag | Effect |
|---|---|
| `--mode merge` (default) | Idempotent. Embedded substrates upsert (no destructive wipe). Flat substrates (`concepts/`, `trajectories.jsonl`, `sent-to-cull.jsonl`) skip-if-target-exists to preserve operator additions. No `--force` required. |
| `--mode replace` | Destructive. Each embedded subsystem fires `assertDestructiveTargetAllowed()` (#10845) before truncating + restoring. Flat substrates fire the guard against the target file/dir before overwriting. Refuses if any target is non-empty without `--force`. |
| `--force` | Required when `--mode replace` AND any target is populated. Acknowledges that data will be overwritten. Also overrides the flat-file skip-if-non-empty rule under `--mode merge`. |
| `--force-topology-mismatch` | Bypasses the topology compatibility refusal when restoring a legacy federated-topology bundle into a unified deployment; collection IDs may diverge across topologies. |

### Pre-flight integrity validation

Before any write touches a service, the restore orchestrator validates:

1. The 5 required subdirectories (`kb/`, `mc/`, `graph/`, `concepts/`, `trajectories/`) exist.
2. Optional `mailbox/` (added in #10871 AC-A) is tolerated absent — legacy bundles still restore.
3. Each `.jsonl` file inside any subdir is parseable (first non-empty line); torn-write or corruption fails fast.
4. `bundle-meta.json` parses cleanly when present; absent metadata triggers a warning and skips the topology check (legacy bundle path).

A torn or partial bundle aborts with a clear error and zero side effects on the live substrate.

### Production-target destructive-op safeguard

When `--mode replace` writes to canonical `.neo-ai-data/` paths, the destructive-operation guard
(#10845) requires both an environment variable AND an explicit confirmation token to permit the
operation. Otherwise the guard refuses and the restore aborts before the truncate fires. Disposable
targets (under `tmp/`, OS temp dir, or `:memory:` SQLite) bypass the bypass requirement automatically
— this is what enables Playwright unit tests to exercise replace-mode behavior safely.

```bash readonly
# Production replace example (only use when intentional):
NEO_ALLOW_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE=true \
npm run ai:restore -- /path/to/.neo-ai-data/backups/backup-2026-05-07T12-00-00.000Z \
    --mode replace --force
# Caller must additionally set --confirmation 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE'
# at the SDK level (programmatic use); the CLI defaults to prompting an explicit operator
# in future iterations.
```

### Programmatic usage

The orchestrator is also exposed as `runRestore(...)` from `buildScripts/ai/restore.mjs` for
embedding inside higher-level recovery substrate (e.g., the `#10844` daily snapshot pipeline,
or restore-from-cold integration harnesses):

```javascript readonly
import {runRestore} from './buildScripts/ai/restore.mjs';

const result = await runRestore({
    bundleRoot           : '/path/to/backup-2026-05-07T12-00-00.000Z',
    mode                 : 'merge',
    force                : false,
    forceTopologyMismatch: false
});

console.log(result.subsystems.kb.imported);     // KB chunks imported
console.log(result.topology.match);              // topology compat verdict
console.log(result.meta?.gitSha);                // bundle gitSha for cross-version diagnostics
```

The returned object includes per-subsystem result blocks, the parsed `bundle-meta.json` (or
`null` for legacy bundles), and the topology-check verdict for downstream observability.

## Configuration

The server supports loading a custom configuration file via the `-c` or `--config` CLI flag. This allows you to override default settings such as the database port, embedding model, or backup paths without modifying the source code.

### Usage

```bash readonly
node ai/mcp/server/memory-core/mcp-server.mjs -c ./my-config.json
```

### Configuration File Format

You can provide a JSON file or an ES Module (`.mjs`) that exports a configuration object. The custom configuration is deep-merged with the default settings.

**Example `my-config.json`:**

```json readonly
{
    "debug": true,
    "modelName": "gemini-2.5-pro",
    "transport": "sse",
    "mcpHttpPort": 3001,
    "memoryDb": {
        "port": 8005,
        "collectionName": "my-custom-memory"
    }
}
```

This flexibility is crucial for:
*   **Cloud Deployments:** Switching `transport` to `"sse"` allows the server to run as a microservice in Docker, accepting connections on `mcpHttpPort` (default 3001; env var `MCP_HTTP_PORT` per #10808; `SSE_PORT` legacy alias remains readable during deprecation window). See the [Deployment Cookbook](DeploymentCookbook.md) for the current Agent OS deployment authority.
*   **Custom Models:** Switching to a different Gemini model version.
*   **Port Conflicts:** Running multiple instances or avoiding conflicts with other services.
*   **Environment Specifics:** Adjusting paths for different deployment environments.

## Powered by Neo.mjs

This server isn't just a standard Node.js application; it demonstrates the versatility of the Neo.mjs framework beyond the browser. By leveraging the **Neo.mjs Class System** for backend services, the server achieves a robust and maintainable architecture.

### 1. Singleton Services

Every service (e.g., `SessionService`, `MemoryService`) is a **Neo.mjs Singleton**. This ensures a single source of truth for application state, global accessibility, and consistent lifecycle management without the need for complex dependency injection frameworks.

### 2. Asynchronous Initialization (`initAsync`)

The server relies on the framework's `initAsync()` lifecycle hook to orchestrate complex dependency chains without race conditions.
*   `ChromaManager` establishes the database connection.
*   `DatabaseLifecycleService` waits for `ChromaManager` and ensures the DB process is running.
*   `SessionService` waits for the DB to be ready before starting the auto-discovery summarization.

All of this happens automatically during the startup sequence, ensuring a fully initialized environment before the first tool call is accepted.

### 3. Reactive Configurations

The server uses Neo.mjs **Reactive Configs** to manage state. Configuration properties (like `model_` or `connected_`) automatically generate getters, setters, and change hooks (`afterSet...`). This allows services to react dynamically to environment changes or state transitions (e.g., re-initializing a model if the API key changes) with clean, declarative code.
