# Self-Repair Protocol (System Diagnostic & Treatment Matrix)

When tasked with executing a system healthcheck, diagnosing a corrupted state, or restoring infrastructure communication (e.g., failed handoffs), you MUST execute this chronological protocol.

## Phase 1: Infrastructure Verification & Playwright Testing

0. **Identify the surface FIRST.** The four MCP servers do not live in the same place, so one symptom has two remedies — restarting the wrong one wastes the outage.

    | Server | Runs as | Harness restart fixes it? |
    |---|---|---|
    | `neural-link` · `github-workflow` | host, harness-spawned | **yes** — plus `npm run ai:server-neural-link`, host ports/zombies |
    | `knowledge-base` · `memory-core` | **container** (`kb-server` / `mc-server`) | **no** — `docker`, see 2 |

    Authority: the service list in `ai/deploy/docker-compose.yml`. Never run a host stack to repair a container — it cannot reach it and can contend for the same published port (Chroma's `127.0.0.1:8000:8000`), turning diagnosis into a second fault.

1. **Invoke the `unit-test` skill**: execute `test/playwright/unit/ai/mcp/client/McpServersHealth.spec.mjs`. Use these tests as the absolute source of truth for JSON-RPC sequence validity.
2. **Containerized servers (`kb-server`, `mc-server`, `chroma`, `orchestrator`)**: inspect before acting — `docker ps`, then the container's own log (its stdout carries only boot lines; the real log is a file inside it). **Announce over A2A before any container-affecting action**: recreating `mc-server` severs every agent's MCP session, including the A2A spine you would coordinate over.
    - **Is it running the code you think?** `docker exec <c> cat /app/.neo-revision`, compared against `origin/dev`. Three distinct actions, and only the last changes code: **restart** delivers nothing, **recreate** applies compose-level change only, **rebuild** (`up -d --build`) delivers merged code. Uptime and image timestamps are proxies that undercount; `/app/.neo-revision` is the measured truth.
3. **Deep introspection (`ai/services.mjs`)**: aggregates dependencies so you can bypass the MCP HTTP boundary and invoke internal tooling natively — use it (or `ai/examples/`) when servers crash on boot.
    - *The YAML Cascade:* `services.mjs` eagerly parses every `openapi.yaml` via `ToolService`, so one syntax error (e.g. an unquoted `: `) aborts initialization and prevents **subsequent** MCP servers from booting.
4. **Never guess at a crash.** Boot a host server directly to witness it; for a container, read its in-container log. You have native control; use it.

## Phase 2: Historical Forensics (The "How Did We Get Here" Protocol)
If the infrastructure code is functioning, but the *state* is corrupted (e.g., bad topologies, missing context, duplicated elements), you must triangulate *when* the corruption occurred.

1. **Do not rely entirely on code state**. Code tells you what is broken; the memory tells you *why*.
2. **Utilize the Memory Core**: Execute `get_all_summaries` or `query_summaries` from the `memory-core` MCP Server to dive into previous sessions. **If the Memory Core is offline it is a container condition — return to Phase 1 step 0, not to a host restart.** Semantic recall also degrades silently while a rebuild or restore is in flight: a sweep that returns unrelated rows means the instrument is impaired, never that no prior art exists. Substitute `git log` / `git grep` and say which instrument you used.
3. Comparing previous AI session memories against `git log` history will rapidly narrow down the origin of the corruption.

## Phase 3: Deep Debugging Strategies
If the IDE integration or workspace is locking up during health checks:

- Reference the **`debugging-antigravity`** skill. Follow its playbook to resolve Antigravity IDE configuration lockups, SQLite workspace UI crashes, and redundant language server conflicts.

**Fresh MCP Client Primitive** — for "ghost bugs" where your cached tool definitions disagree with the live server. Never validate your own MCP tool-shape changes through your primary long-lived connection; spawn an isolated client for a clean handshake: `node ai/mcp/client/mcp-cli.mjs --server <target> --call-tool <tool>`.

## Phase 4: Treatment & Issue Escalation
If you identify infrastructure degradation or failing Playwright tests:

1. **NO Sandman Handoff Updates**: You are strictly FORBIDDEN from creating or modifying `sandman_handoff.md` documents. The DreamService will silently overwrite these documents, resulting in lost insight.
2. **Create Bug Tickets**: If you identify a systemic failure, formally capture it natively using `create_issue`.
3. **Write Failing Tests**: Always strive to codify failures. If a system is broken and no test coverage caught it, utilize the `unit-test` skill to write a new, failing Playwright test confirming the bug. It is better to merge a failing architectural test that accurately replicates a bug than to write a generic markdown summary.

**Rule of Thumb:** Document the failure as code. Track the failure as a GitHub Issue. Heal the system through a Pull Request.
