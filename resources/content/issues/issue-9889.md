---
id: 9889
title: 'feat: Implement NL Action Recorder — log Neural Link tool calls to nl_action_log'
state: OPEN
labels:
  - enhancement
  - ai
  - testing
  - 'agent-task:pending'
  - 'agent-role:dev'
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-11T18:58:10Z'
updatedAt: '2026-04-11T18:58:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9889'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9890 feat: DreamService 4th REM Vector — executeNLActionDigest()'
---
# feat: Implement NL Action Recorder — log Neural Link tool calls to nl_action_log

## Summary

Add a `RecorderService` to the Neural Link MCP server that intercepts every `callTool()` invocation and persists structured action logs to a new `nl_action_log` table in `memory-core.sqlite`. This is the **foundational primitive** for the Karpathy Loop (discussion #9887) — enabling RLAIF dataset generation, automated Playwright test synthesis, and downstream fine-tuning pipelines.

## Motivation

Without a structured record of what Neural Link tools agents invoke, in what order, and with what outcome (success/failure/duration/reward), the following capabilities are blocked:

- Automated Playwright E2E test scaffolding from successful agent exploration sequences
- RLAIF reward signal generation for swarm training and local model fine-tuning
- Sequence replay for regression testing
- Graph linkage: `TEST` nodes → `CLASS` nodes via `VALIDATES` edges in the Native Edge Graph
- Offline Librarian sub-agent training on Neo.mjs-specific tool usage patterns

## Architectural Context

**Call Chain (confirmed by codebase audit):**
```
AI Agent (MCP stdio)
  → neural-link/Server.mjs  [CallToolRequestSchema handler]
  → neural-link/services/toolService.mjs  [serviceMapping dispatch]
  → ai/mcp/ToolService.mjs :: callTool()   ← 🎯 INTERCEPT POINT
  → {ComponentService, InstanceService, RuntimeService, ...}
  → Bridge.mjs  [WebSocket hub]
  → Browser App Worker
```

**Storage Decision:** The NL MCP server and Memory Core MCP server are **separate processes** (each has its own `mcp-server.mjs` entry point). The cleanest approach is for `RecorderService` to open a **dedicated `better-sqlite3` handle** directly to `memory-core.sqlite`. Since WAL mode is already enforced (`PRAGMA journal_mode = WAL` in `SQLiteVectorManager.initAsync()`), multiple concurrent writers are safe without coordination overhead.

**Session Context Available:** `ConnectionService.sessionData` maps `appWorkerId → { appName, connectedAt }`. The `sessionId` parameter already flows through every NL tool invocation's args. `ConnectionService.agentId` (`agent-{uuid}`) is set once at NL server startup and cleanly identifies the agent process.

**`sequence_id` Design:** The `Server.mjs` `CallToolRequestSchema` handler fires once per MCP invocation. A module-level turn counter incremented there groups all tool calls within one agent step under the same `sequence_id = agentId + '_' + turnCounter`.

## Schema — `nl_action_log`

```sql
CREATE TABLE IF NOT EXISTS nl_action_log (
    id          TEXT PRIMARY KEY,   -- crypto.randomUUID()
    agent_id    TEXT NOT NULL,      -- ConnectionService.agentId (process-level identity)
    session_id  TEXT,               -- appWorkerId from tool args (target App Worker)
    sequence_id TEXT NOT NULL,      -- agent_id + '_' + turn_counter (groups one agent turn)
    timestamp   INTEGER NOT NULL,   -- Date.now()
    tool        TEXT NOT NULL,      -- e.g. 'simulate_event', 'set_instance_properties'
    args        TEXT NOT NULL,      -- JSON.stringify(args) — full arg payload
    result      TEXT,               -- JSON.stringify(result) or error message
    success     INTEGER DEFAULT 0,  -- 1 = success, 0 = thrown error
    duration_ms INTEGER,            -- wall-clock latency in ms
    app_name    TEXT,               -- resolved from ConnectionService.sessionData
    reward      REAL DEFAULT NULL   -- NULL until set by DreamService RLAIF scorer (future)
);
CREATE INDEX IF NOT EXISTS idx_nl_action_log_sequence  ON nl_action_log(sequence_id);
CREATE INDEX IF NOT EXISTS idx_nl_action_log_session   ON nl_action_log(session_id);
CREATE INDEX IF NOT EXISTS idx_nl_action_log_timestamp ON nl_action_log(timestamp);
```

## New Files

### `ai/mcp/server/neural-link/services/RecorderService.mjs`

- Extends `Neo.core.Base`, singleton
- Opens a dedicated `better-sqlite3` handle to `memory-core.sqlite` path (read from NL `config.mjs`)
- Creates `nl_action_log` table + indexes in `initAsync()` if absent
- Exposes `log(entry)` — synchronous `INSERT` (fire-and-forget, never throws)
- Exposes `querySequences({ sinceTimestamp, minSuccessRate, limit })` — for `DreamService` ingestion
- Exposes `pruneOlderThan(days)` — housekeeping, callable from Sandman REM cycle

## Modified Files

### `ai/mcp/server/neural-link/services/toolService.mjs`

HOF wrapper around `callTool` — intercepts all 33 tool invocations:

```js
const _callTool = toolService.callTool.bind(toolService);

const callTool = async (name, args) => {
    const t0       = Date.now();
    const seqId    = `${ConnectionService.agentId}_${currentTurnId}`;
    const sessionId = args?.sessionId ?? ConnectionService.getDefaultSessionId();
    const appName  = ConnectionService.sessionData.get(sessionId)?.appName ?? null;

    let result, success = 0;
    try {
        result  = await _callTool(name, args);
        success = 1;
        return result;
    } catch (err) {
        result = { error: err.message };
        throw err;
    } finally {
        RecorderService.log({
            agent_id   : ConnectionService.agentId,
            session_id : sessionId,
            sequence_id: seqId,
            timestamp  : t0,
            tool       : name,
            args       : JSON.stringify(args ?? {}),
            result     : JSON.stringify(result ?? null),
            success,
            duration_ms: Date.now() - t0,
            app_name   : appName
        });
    }
};
```

### `ai/mcp/server/neural-link/Server.mjs`

- Add module-level `let _turnId = 0`
- Increment at the top of the `CallToolRequestSchema` handler (before the health check gate)
- Export `getCurrentTurnId()` for `toolService.mjs` to read

### `ai/mcp/server/neural-link/config.mjs`

- Add `memoryCoreDbPath` config key pointing to the same SQLite file as Memory Core
- Respects the same pattern as `aiConfig.engines.neo.dataDir + filename`

## Test

### `test/playwright/unit/ai/neural-link/RecorderService.spec.mjs`

Follows the exact isolation pattern from `DreamService.spec.mjs`:
- Isolated `tmp/` SQLite DB (unique per `process.pid + Date.now()`)
- `beforeAll`: configure `aiConfig` to point to tmp path, init `SystemLifecycleService`
- `afterAll`: close DB handle, `unlinkSync` tmp files
- Test cases:
  - `log()` inserts a row with correct fields
  - `querySequences()` groups and filters by `sequence_id`
  - `success` flag is `1` on clean call, `0` on thrown error
  - `app_name` is populated from `ConnectionService.sessionData`
  - `reward` is `NULL` on initial insert
  - `pruneOlderThan(0)` deletes all rows

## Out of Scope (follow-up tickets)

These are explicitly deferred to preserve ticket atomicity:

- `DreamService.executeNLActionDigest()` — 4th REM ingestion vector that reads `nl_action_log` and synthesizes Playwright test scaffolds
- RLAIF reward scoring pipeline
- Playwright test scaffold generation into `test/playwright/e2e/generated/`
- Graph linkage: `TEST` node upsert + `VALIDATES` edges
- Local model fine-tuning pipeline

## Acceptance Criteria

- [ ] `nl_action_log` table + indexes created on NL server startup if absent
- [ ] All 33 NL tool invocations are logged (both success and error paths)
- [ ] `sequence_id` correctly groups all tools fired within the same MCP turn
- [ ] `app_name` is populated from `ConnectionService.sessionData` when available
- [ ] `reward` column is `NULL` on insert (reserved for future RLAIF scorer)
- [ ] `RecorderService.log()` never throws — errors are swallowed internally to avoid breaking tool execution
- [ ] Playwright unit test passes with isolated SQLite DB (no side effects on real memory-core.sqlite)
- [ ] Zero changes to existing tool semantics, return values, or error surfaces
- [ ] `better-sqlite3` WAL-mode concurrent write confirmed safe (existing `PRAGMA journal_mode = WAL` in `SQLiteVectorManager`)

## A2A Context Bridge

**Avoided Pitfalls:**
- Do NOT use a separate `.sqlite` file — the `nl_action_log` table must be co-located in `memory-core.sqlite` to enable future JOIN queries between action sequences and session memories without cross-DB coordination.
- Do NOT open the DB connection inside `log()` on every call — establish once in `initAsync()` and reuse the handle.
- Do NOT use async writes for `log()` — the synchronous `better-sqlite3` `.run()` is the correct pattern here (already established by `SQLiteVectorManager`). Async embedding is not needed for structured relational data.
- The `RecorderService` must be `initAsync()`-aware — it must not block the MCP server startup on DB unavailability. Degrade gracefully with a warning log if the memory-core path is not configured.


## Timeline

- 2026-04-11T18:58:11Z @tobiu assigned to @tobiu
- 2026-04-11T18:58:13Z @tobiu added the `enhancement` label
- 2026-04-11T18:58:13Z @tobiu added the `ai` label
- 2026-04-11T18:58:13Z @tobiu added the `testing` label
- 2026-04-11T18:58:13Z @tobiu added the `architecture` label
- 2026-04-11T18:58:17Z @tobiu added the `agent-task:pending` label
- 2026-04-11T18:58:17Z @tobiu added the `agent-role:dev` label
- 2026-04-11T19:22:39Z @tobiu cross-referenced by #9890
- 2026-04-11T19:23:02Z @tobiu cross-referenced by #9892
- 2026-04-11T19:23:12Z @tobiu marked this issue as blocking #9890

