# Self-Repair Protocol (System Diagnostic & Treatment Matrix)

When tasked with executing a system healthcheck, diagnosing a corrupted state, or restoring infrastructure communication (e.g., failed handoffs), you MUST execute this chronological protocol.

## Phase 0: Classify the failure — attachment, service, or authority

**A health probe cannot see an attachment failure, because the probe is green during one.** The
2026-08-20 incident ran ~12 hours with a repo-local client reporting 13 KB + 42 MC tools while the
seat's own callable registry had **none** — 159 tools against 214 after repair. Classify before
treating; Phase 1's surface table assumes the seat is attached at all.

| native tools | repo-local client | runtime authority | lane |
|---|---|---|---|
| **absent** | green | any | **attachment/config** — the servers are fine, the seat is not attached to them. Restarting containers repairs nothing and severs other seats. |
| any | **red** | local Docker | **service** — Phase 1 below |
| any | **red** | none (cloud) | inspect what is reachable, then **escalate** — you cannot restart what you cannot reach |

**Absence of a tool is never absence of data.** A missing `list_messages` is not an empty inbox; a
missing `ask_knowledge_base` is not an absent answer. Reading either as a *result* is how a seat runs
for hours on a channel nobody is reading — the failure this phase exists to stop.

**Escalation must not assume the broken channel.** When Memory Core is the degraded surface, A2A is
down with it: record the planned action and the unavailable channel on the governing ticket instead.

## Phase 1: Infrastructure Verification & Playwright Testing

0. **Identify the surface FIRST** — one symptom, two remedies; the wrong restart wastes the outage. Authority: the service list in `ai/deploy/docker-compose.yml`.

    | Server | Runs as | Harness restart fixes it? |
    |---|---|---|
    | `neural-link` · `github-workflow` | host, harness-spawned | **yes** — plus `npm run ai:server-neural-link`, host ports/zombies |
    | `knowledge-base` · `memory-core` | **container** (`kb-server` / `mc-server`) | **no** — `docker`, see 2 |

    Never run a host stack to repair a container: it cannot reach it, and it can contend for the same published port (Chroma's `8000`), turning diagnosis into a second fault.

1. **Invoke the `unit-test` skill**: execute `test/playwright/unit/ai/mcp/client/McpServersHealth.spec.mjs` as the source of truth for JSON-RPC sequence validity.
2. **Containers (`kb-server`, `mc-server`, `chroma`, `orchestrator`)**: inspect before acting — `docker ps`, then the container's own log (stdout carries only boot lines; the real log is inside it). **Announce before acting**: recreating `mc-server` severs every agent's MCP session. Announce over A2A — but when Memory Core IS the degraded surface that channel is down, so record the planned action and the unavailable channel on the governing ticket instead. Never act silently, and never treat a dead channel as permission to skip the notice.
    - **Running the code you think?** `docker exec <c> cat /app/.neo-revision` vs `origin/dev`. Only the last of three actions changes code: **restart** delivers nothing, **recreate** applies compose-level change only, **rebuild** (`up -d --build`) delivers merged code. Uptime and image timestamps undercount; `.neo-revision` is measured truth.
3. **Deep introspection (`ai/services.mjs`)**: bypass the MCP HTTP boundary and invoke internal tooling natively when servers crash on boot.
    - *The YAML Cascade:* `services.mjs` eagerly parses every `openapi.yaml` via `ToolService`, so one syntax error (e.g. an unquoted `: `) aborts init and prevents **subsequent** servers from booting.
4. **Never guess at a crash.** Boot a host server directly to witness it; for a container, read its in-container log.

## Phase 2: Historical Forensics
Code is functioning but *state* is corrupted (bad topologies, missing context, duplicates) — triangulate *when*.

1. Code tells you what is broken; the memory tells you *why*.
2. **Memory Core**: `get_all_summaries` / `query_summaries` for prior sessions. **If it is offline that is a container condition — return to Phase 1 step 0, never a host restart.** Semantic recall also degrades silently during a rebuild or restore: unrelated rows mean an impaired instrument, never absent prior art. Substitute `git log` / `git grep` and name the instrument you used.
3. Prior memories against `git log` narrows the origin fast.

## Phase 3: Deep Debugging

- IDE/workspace lockups during health checks: the **`debugging-antigravity`** skill owns Antigravity config lockups, SQLite workspace crashes, and language-server conflicts.
- **Fresh MCP Client Primitive** — for "ghost bugs" where cached tool definitions disagree with the live server. Never validate your own tool-shape changes through your primary long-lived connection; spawn an isolated client: `node ai/mcp/client/mcp-cli.mjs --server <target> --call-tool <tool>`.

## Phase 4: Treatment & Escalation

1. **NO Sandman Handoff Updates**: never create or modify `sandman_handoff.md` — DreamService silently overwrites it and the insight is lost.
2. **Create Bug Tickets**: capture systemic failures via `create_issue`.
3. **Write Failing Tests**: codify the failure. A merged failing architectural test that replicates a bug beats a markdown summary; use the `unit-test` skill.

**Rule of Thumb:** Document the failure as code. Track it as a GitHub Issue. Heal it through a Pull Request.
