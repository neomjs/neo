# The Memory Core Server

The **Memory Core Server** (`neo.mjs-memory-core`) is the AI agent's "Hippocampus" — its long-term memory center. It acts as a persistent state layer that allows agents to remember past interactions, learn from previous decisions, and maintain context across different development sessions.

## Purpose

Without memory, every session is a blank slate. An agent fixing a bug today has no recollection of the similar bug it fixed last week. The Memory Core solves this by persisting:
*   **Interactions:** Every prompt, thought process, and response is stored as a raw memory.
*   **Decisions:** The reasoning behind *why* a certain approach was chosen.
*   **Summaries:** High-level abstractions of entire work sessions to enable fast retrieval of past experiences.

## Architecture

The server is built on a modular service architecture, extending `Neo.core.Base`. It uses **ChromaDB** as the vector database for semantic search and **Google Gemini** for text embeddings and summarization.

### Key Services

*   **`MemoryService`**: Manages raw, granular memories. It handles the ingestion of new agent interactions and performs semantic searches across the raw interaction history.
*   **`SessionService`**: Responsible for the "Auto-Discovery" process. It uses an LLM to analyze completed sessions and generate structured summaries (Title, Category, Quality Scores) to make them easily searchable.
*   **`SummaryService`**: Manages the high-level session summaries. It provides tools to query past work based on topics or categories (e.g., "refactoring", "bugfix").
*   **`DatabaseLifecycleService`**: Manages the underlying ChromaDB process. It can start, stop, and monitor the database status, ensuring the persistence layer is available when needed.
*   **`HealthService`**: A gatekeeper that ensures all dependencies (ChromaDB connectivity, Collections, API Keys) are healthy before allowing operations.

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

### Single-Writer Enforcement: `NEO_MC_PRIMARY`

In multi-harness deployments (Claude Code worktrees + Antigravity + Codex Desktop + per-workspace language servers), several Memory Core instances may share the same Chroma collection. To prevent races on session summarization, the startup auto-discovery path is gated by **two** flags rather than one:

| `AUTO_SUMMARIZE` | `NEO_MC_PRIMARY` | Behavior on startup |
|---|---|---|
| `false` | (any) | Skip — current default; no summarization at boot. |
| `true` | `false` (default) | Skip with operator-visible log; healthcheck reports `startup.summarizationStatus: "skipped-non-primary"`. |
| `true` | `true` | Fire — drift-detection sweep runs on this instance only. |

Operators set `NEO_MC_PRIMARY=true` on the **canonical** Memory Core instance only (typically the one bound to the operator's primary harness). Non-primary instances stay quiet and rely on the canonical instance to handle the shared collection. The same gate applies to disconnect-triggered `queueSummarizationJob` calls, so non-primary instances do not write to the shared `SummarizationJobs` SQLite table either.

The two flags are deliberately AND-ed (not OR-ed): forgetting `NEO_MC_PRIMARY` while having `AUTO_SUMMARIZE=true` is the safe default — non-primary instances do nothing rather than racing the canonical one. Tracked under [#10813](https://github.com/neomjs/neo/issues/10813).

### Session Sunset Polling (Piece B)

To gracefully capture sessions from non-primary harnesses without violating the single-writer constraint or losing events to isolated per-instance SQLite queues, the canonical instance employs a **B2 Mailbox-Poll** strategy.

When `NEO_MC_PRIMARY=true`, the `SessionService` spins up a periodic background poller (every 30s) that queries the A2A Mailbox for unread self-DM messages matching the contract:
`{ taggedConcepts: ['sunset-protocol-handover'] }`

This substrate bridges the gap between instances: when any agent on any clone runs the session-sunset skill, the final self-DM is persisted in the shared graph. The canonical MC sees this unread message, triggers a summarization sweep to ingest the finalized session, and marks the message as read to prevent double-processing.

## Tools

The server exposes a suite of tools via the Model Context Protocol (MCP).

### Memory Operations

*   **`add_memory`**: The core persistence tool. Saves the `{prompt, thought, response}` triplet.
*   **`get_session_memories`**: Retrieves the full chronological history of a specific session. Useful for context recovery.
*   **`query_raw_memories`**: Performs a semantic vector search across *all* raw memories. Use this to find specific details (e.g., "What was the error message in the grid component?").

### Summary Operations

*   **`query_summaries`**: Performs a semantic vector search across session summaries. Use this to find relevant *past sessions* (e.g., "Have I worked on the Grid component before?").
*   **`get_all_summaries`**: Lists all session summaries, sorted by date.
*   **`delete_all_summaries`**: A destructive tool to clear the summary index (useful if you want to re-summarize everything with a new model).
*   **`summarize_sessions`**: Manually triggers the summarization process for specific or all pending sessions.

### Session Operations

*   **`resume_session`**: Pure validation/query — returns structural metadata about whether a candidate session ID is safe for the agent to keep using on reconnect (set the `Mcp-Session-Id` header to that ID for subsequent calls). Does NOT mutate `RequestContextService` or any server-side session state. Returns either a success payload (`status: 'resumable'` plus `memoryCount`, `lastActivityAt`, `summarizationStatus`) or one of four structured errors: `INVALID_SESSION_ID`, `SESSION_NOT_FOUND`, `SESSION_FINALIZED` (already summarized — start fresh), `SESSION_BUSY` (concurrent summarization mid-flight — retry shortly). Use after recovering a candidate session ID from a prior `query_summaries` result or local context.
*   **`set_session_id`**: Legacy / single-tenant fallback only. Overrides the process-global `_legacySessionId`. Rejected with `REQUEST_SCOPED_SESSION_ACTIVE` when invoked under a request-bound `Mcp-Session-Id` context to prevent multi-tenant state corruption. Prefer transport-layer session binding via the `Mcp-Session-Id` header in shared deployments.

### Database Management

*   **`healthcheck`**: Diagnostics tool. Checks ChromaDB status, collection health, API key configuration, identity binding, and effective ChromaDB topology. See **Healthcheck Response Shape** below for the full payload contract.
*   **`start_database`**: Starts the local ChromaDB process.
*   **`stop_database`**: Stops the local ChromaDB process.
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
            "mode": "federated",
            "coordinates": { "host": "localhost", "port": 8100 },
            "resolvedVia": "engines.chroma"
        }
    },
    "features": {
        "summarization": true
    },
    "startup":   { "summarizationStatus": "not_attempted", "summarizationDetails": null },
    "mailboxPreview": null,
    "identity":  { "source": "env-var", "bound": true, "nodeId": "@neo-opus-4-7" },
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

Introduced in #10127 (follow-up to sub-epic #10015's unified-topology pillar — #10001 routing + #10007 lifecycle bypass). The block surfaces **which ChromaDB instance Memory Core is actually using**, so operators deploying in unified mode can verify the flag took effect without inspecting logs or re-running the config through `node -e`.

| Field | Type | Meaning |
|---|---|---|
| `mode` | `'unified' \| 'federated'` | `'unified'` means Memory Core reuses the KB's ChromaDB instance (`chromaUnified=true`). `'federated'` means Memory Core owns its own instance (default). |
| `coordinates` | `{host, port} \| null` | The effective `{host, port}` the client is targeting. `null` when `chromaUnified=true` but `engines.kb.chroma` is missing from config — a misconfig surfaced as observable data rather than a 500. |
| `resolvedVia` | `'engines.kb.chroma' \| 'engines.chroma'` | The exact config key path the resolver read. Gives operators a direct pointer to what to inspect when coordinates look wrong. |
| `error` | `string` (optional) | Present only when the resolver threw — names the specific misconfig. |

**Why this matters:** Without `database.topology`, a forgotten `NEO_CHROMA_UNIFIED=true` silently caused Memory Core to spin up its own ChromaDB, mount a distinct volume, and populate a distinct collection set — diverging from the KB state until cross-tenant drift emerged. The block closes that observability gap in-band.

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

Introduced for Chroma-side local embedding-provider validation (#10723), expanded for SQLite-side embedding observability (#10773), then consolidated to one provider selector by #10804. The block surfaces the single embedding route used by ChromaDB retrieval and SQLite Native Edge Graph operations:

| Field | Type | Meaning |
|---|---|---|
| `active` | `'gemini' \| 'openAiCompatible' \| 'ollama' \| string` | Provider selected for every embedding consumer. Controlled by `embeddingProvider` / `NEO_EMBEDDING_PROVIDER`. |
| `host` | `string \| null` | Embedding provider host for local providers; `null` for Gemini. |
| `model` | `string \| null` | Configured embedding model name. |
| `dimensions` | `number` | Configured `vectorDimension`; must match the embedding model's actual output dimension. |
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
*   **Cloud Deployments:** Switching `transport` to `"sse"` allows the server to run as a microservice in Docker, accepting connections on `mcpHttpPort` (default 3001; env var `MCP_HTTP_PORT` per #10808; `SSE_PORT` legacy alias remains readable during deprecation window). See the [Deployment Cookbook](DeploymentCookbook.md) for a full shared deployment walkthrough.
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
