# Antigravity 2.x Debugging Guide

Use this guide to establish the current configuration authority before changing an Antigravity MCP setup. Product documentation and the installed bundle are the evidence sources; old workspace recipes are not.

## 1. Establish the MCP Authority

Antigravity 2.x documents two valid MCP scopes:

- global: `~/.gemini/config/mcp_config.json`
- workspace: `.agents/mcp_config.json`

Choose one owner for each server. A workspace definition is valid, but declaring the same server globally and in the workspace can create two independently managed subprocesses. The canonical paths come from the current [Antigravity MCP documentation](https://antigravity.google/docs/mcp).

Keep adjacent configuration families separate:

- Antigravity CLI preferences live at `~/.gemini/antigravity-cli/settings.json`; that preferences file is not the MCP registry.
- Workspace rules and skills live under `.agents/rules/` and `.agents/skills/`; the [Gemini CLI migration guide](https://antigravity.google/docs/gcli-migration) describes how existing `AGENTS.md`, `GEMINI.md`, skills, and MCP definitions migrate.
- `--user-data-dir` selects an Electron/Chromium UI profile. It does not prove or relocate the language-server MCP root. Re-probe the installed bundle after a product upgrade instead of deriving an MCP path from the UI-profile flag.

If installed behavior disagrees with the docs, collect the Antigravity version, resolve symlinks, inspect the running process arguments, and search the installed language-server binary for `mcp_config.json` plus its parent root. Record the version boundary; do not promote a compatibility path into a universal rule.

## 2. Diagnose Duplicate Processes Before Explaining Them

Do not assume a twin-language-server cause. First build a process census:

```bash
pgrep -fl 'Antigravity|language_server|mcp-server'
ps -o pid=,ppid=,pgid=,etime=,command= -p <pid-list>
```

For each Neo MCP process, capture its PID, parent PID, process group, working directory, and command. Then inspect both documented MCP authorities. A duplication claim is established only when the same logical server has multiple live owners or definitions.

Correction order:

1. Decide whether the server is global or workspace-owned.
2. Remove only the duplicate definition from the other authority.
3. Fully quit and relaunch Antigravity so the MCP client performs a fresh handshake.
4. Repeat the process census and the server healthchecks.

## 3. Keep Neo Lifecycle Ownership Intact

Neo MCP servers are stdio clients of shared services; the orchestrator owns background Chroma, summary, Dream, and sync schedules. Do not reintroduce per-server `autoStartDatabase` or related auto-* flags to repair an Antigravity symptom. That recreates the retired per-instance lifecycle and can multiply work across harness-spawned servers.

Verify the four frontier-harness servers independently:

- GitHub Workflow
- Knowledge Base
- Memory Core
- Neural Link

A healthy tool surface with a broken MCP settings panel is a UI-state incident, not proof that the backend servers failed.

## 4. Investigate a Spinner or `__store` Failure Safely

The historical `__store` null signature has involved stale workspace UI state, but the signature alone does not establish the current cause. Start read-only:

```bash
find "$HOME/Library/Application Support/Antigravity/User/workspaceStorage" -name workspace.json 2>/dev/null
sqlite3 "$HOME/Library/Application Support/Antigravity/User/globalStorage/state.vscdb" \
  "SELECT key FROM ItemTable WHERE key LIKE '%sidebarWorkspaces%';"
```

Before mutating sqlite state, quit Antigravity and create a database backup. If the exact stale key is present and the operator has authorized repair, delete only that key, relaunch, and re-run the healthchecks. Do not purge auth tokens, caches, or entire workspace-storage trees as a first response.

## 5. Validate Tool-Shape Changes with a Fresh Client

The primary IDE connection can retain an older MCP tool manifest after server code changes. Use Neo's isolated client to prove the live shape:

```bash
node ai/mcp/client/mcp-cli.mjs --server memory-core --call-tool "your_modified_tool" '{"param":"test"}'
```

This creates a fresh client/server handshake without treating a cached IDE definition as current evidence.
