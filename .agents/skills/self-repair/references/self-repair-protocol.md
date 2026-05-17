# Self-Repair Protocol (System Diagnostic & Treatment Matrix)

When tasked with executing a system healthcheck, diagnosing a corrupted state, or restoring infrastructure communication (e.g., failed handoffs), you MUST execute this chronological protocol. 

## Phase 1: Infrastructure Verification & Playwright Testing
Your first priority is determining if the bridge between the Neo.mjs Agent OS clients and the MCP servers is healthy.

1. **Invoke the `unit-test` skill**: Navigate to `test/playwright/unit/ai/` and execute target test suites like `McpServersHealth.spec.mjs`. Use these tests as the absolute source of truth for JSON-RPC sequence validity.
2. **Verify Daemon & Database Status**: If `memory-core`, `knowledge-base`, or the Neural Link bridge are offline, check your `package.json` scripts. Verify that ChromaDB is running without zombie processes.
    - **Knowledge Base & Memory Core** share a unified ChromaDB on port `8000` (script: `npm run ai:server`)
    - **Neural Link Bridge** ensures realtime VDOM sync (script: `npm run ai:server-neural-link`)
    - Search for and terminate zombie processes if ports are locked before attempting to restart the services.
3. **Deep Infrastructure Introspection (`ai/services.mjs`)**: The entire Agent OS backend is located in `ai`. The `ai/services.mjs` module aggregates dependencies, allowing you to bypass full MCP HTTP boundaries and interact natively with internal tooling. If servers crash on boot, use `ai/examples/` (such as chroma checks) or a generic Node process to invoke internal routines via `services.mjs` directly.
    - *Known Failure Mode (The YAML Cascade):* Because `ai/services.mjs` eagerly parses configurations via `ToolService`, a syntax error (e.g., an unquoted string containing `: ` causing a `YAMLException`) in *any* MCP server's `openapi.yaml` will abort the initialization sequence, preventing subsequent MCP servers in the configuration from booting.
4. **Native Terminal Execution**: If an MCP connection fails or an MCP server is unreachable, do not blindly guess why. Boot the Neo MCP servers directly in a separate terminal process using the `run_command` tool to witness the crash or monitor logs. You have native control; use it.

## Phase 2: Historical Forensics (The "How Did We Get Here" Protocol)
If the infrastructure code is functioning, but the *state* is corrupted (e.g., bad topologies, missing context, duplicated elements), you must triangulate *when* the corruption occurred.

1. **Do not rely entirely on code state**. Code tells you what is broken; the memory tells you *why*.
2. **Utilize the Memory Core**: Execute `get_all_summaries` or `query_summaries` from the `memory-core` MCP Server to dive into previous sessions. **If the memory core is offline, refer back to Phase 1 and restart `npm run ai:server` on port 8000.**
3. Comparing previous AI session memories against `git log` history will rapidly narrow down the origin of the corruption.

## Phase 3: Deep Debugging Strategies
If the IDE integration or workspace is locking up during health checks:

- Reference the **`debugging-antigravity`** skill. Follow its playbook to resolve Antigravity IDE configuration lockups, SQLite workspace UI crashes, and redundant language server conflicts.

If you are developing or testing MCP servers and encounter "ghost bugs" where your cached tool definitions do not match the live server state:

- **Use the Fresh MCP Client Primitive**: Agents testing their own connected MCP servers suffer from stale cache windows. Never use your primary tool surface to validate your own MCP tool-shape modifications.
- **Action**: Bypass your primary long-lived host connection by spawning an isolated client. Execute `node ai/mcp/client/mcp-cli.mjs --server <target> --call-tool <tool>` via the `run_command` tool. This performs a clean handshake and parses the live definitions directly, proving your modifications are valid.

## Phase 4: Treatment & Issue Escalation
If you identify infrastructure degradation or failing Playwright tests:

1. **NO Sandman Handoff Updates**: You are strictly FORBIDDEN from creating or modifying `sandman_handoff.md` documents. The DreamService will silently overwrite these documents, resulting in lost insight.
2. **Create Bug Tickets**: If you identify a systemic failure, formally capture it natively using `create_issue`.
3. **Write Failing Tests**: Always strive to codify failures. If a system is broken and no test coverage caught it, utilize the `unit-test` skill to write a new, failing Playwright test confirming the bug. It is better to merge a failing architectural test that accurately replicates a bug than to write a generic markdown summary.

**Rule of Thumb:** Document the failure as code. Track the failure as a GitHub Issue. Heal the system through a Pull Request.
