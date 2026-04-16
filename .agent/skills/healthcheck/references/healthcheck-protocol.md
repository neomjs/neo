# Healthcheck Protocol (System Diagnostic & Treatment Matrix)

When tasked with executing a system healthcheck, diagnosing a corrupted state, or restoring infrastructure communication (e.g., failed handoffs), you MUST execute this chronological protocol. 

## Phase 1: Infrastructure Verification & Playwright Testing
Your first priority is determining if the bridge between the Neo.mjs Agent OS clients and the MCP servers is healthy.

1. **Invoke the `unit-test` skill**: Navigate to `test/playwright/unit/ai/` and execute target test suites like `McpServersHealth.spec.mjs`. Use these tests as the absolute source of truth for JSON-RPC sequence validity.
2. **Native Terminal Execution**: If an MCP connection fails or an MCP server is unreachable, do not blindly guess why. Boot the Neo MCP servers directly in a separate terminal process (e.g., `npm run ai:server-memory`) using the `run_command` tool to witness the crash or monitor logs. You have native control; use it.

## Phase 2: Historical Forensics (The "How Did We Get Here" Protocol)
If the infrastructure code is functioning, but the *state* is corrupted (e.g., bad topologies, missing context, duplicated elements), you must triangulate *when* the corruption occurred.

1. **Do not rely entirely on code state**. Code tells you what is broken; the memory tells you *why*.
2. **Utilize the Memory Core**: Execute `get_all_summaries` or `query_summaries` from the `memory-core` MCP Server to dive into previous sessions. 
3. Comparing previous AI session memories against `git log` history will rapidly narrow down the origin of the corruption.

## Phase 3: Deep Debugging Strategies
If the IDE integration or workspace is locking up during health checks:

- Reference the **`debugging-antigravity`** skill. Follow its playbook to resolve Antigravity IDE configuration lockups, SQLite workspace UI crashes, and redundant language server conflicts.

## Phase 4: Treatment & Issue Escalation
If you identify infrastructure degradation or failing Playwright tests:

1. **NO Sandman Handoff Updates**: You are strictly FORBIDDEN from creating or modifying `sandman_handoff.md` documents. The DreamService will silently overwrite these documents, resulting in lost insight.
2. **Create Bug Tickets**: If you identify a systemic failure, formally capture it natively using `create_issue`.
3. **Write Failing Tests**: Always strive to codify failures. If a system is broken and no test coverage caught it, utilize the `unit-test` skill to write a new, failing Playwright test confirming the bug. It is better to merge a failing architectural test that accurately replicates a bug than to write a generic markdown summary.

**Rule of Thumb:** Document the failure as code. Track the failure as a GitHub Issue. Heal the system through a Pull Request.
