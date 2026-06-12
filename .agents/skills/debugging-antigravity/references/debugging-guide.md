# Antigravity IDE Debugging Guide

This guide contains the structural knowledge and troubleshooting playbooks required to keep the Antigravity IDE stable when interacting with the Neo MCP server ecosystem.

## 1. The Twin Language Server Bug & MCP Duplication

### The Problem
Antigravity natively executes parallel language servers:
1. A **System/Global** language server.
2. A **Workspace-specific** language server.

Regardless of user configuration (even if workspace `.gemini/settings.json` has an empty `mcpServers` object), both of these language server processes will independently parse the global MCP configuration and spawn overlapping server binaries. This causes unpreventable **2x process duplication** (e.g., 8 server instances instead of 4). This rules out dual-config edge cases; it is an inherent Antigravity architectural behavior.

### The Fix: Configuration Normalization (`.gemini/settings.json`)
Since the April 7th release, the IDE's local workspace `.gemini/settings.json` natively reads `mcpServers` definitions. This enables the duplication problem if the user also has a global config.

**The Strategy:**
- **Remove** all `mcpServers` array data from local workspace `.gemini/settings.json` bounds.
- **Consolidate** all absolute definitions into the global config: `~/.gemini/antigravity/mcp_config.json`.
- This ensures only a single authority provisions the MCP node processes, preventing race conditions and resource contention.

## 2. Opt-in vs Opt-out Server Initialization Deadlocks (ChromaDB)

### The Problem
If the Antigravity IDE spawns MCP processes (via the language server) and those servers are hardcoded to `autoStartDatabase = true` (Opt-Out), the MCP processes will attempt to boot standalone local ChromaDB/SQLite binaries.
This creates immediate deadlocks when:
- The user is already manually running ChromaDB on port 8000 via external terminal scripts.
- Both language servers duplicate the boot routine, competing for the same filesystem lock.

### The Fix
When defining MCP server configurations (e.g., `ai/mcp/server/knowledge-base/config.mjs` and `memory-core/config.mjs`), all heavy initialization parameters MUST be `Opt-In`:
```javascript
// GOOD: Requires explicit configuration
autoStartDatabase: process.env.NEO_MEM_AUTO_START_DATABASE === 'true',

// BAD: Will execute by default if undefined
autoStartDatabase: process.env.NEO_MEM_AUTO_START_DATABASE !== 'false',
```

## 3. SQLite Workspace Corruption Crash (`__store` / "Loading Spinner")

### The Problem
The IDE uses an embedded SQLite database to track historical Workspaces. Occasionally, stale, duplicated, or "ghost" workspace folders cause the UI state manager to crash when attempting to render the "Manage MCP Servers" panel.

**Symptoms:**
- The main MCP panel displays a **perpetual Loading Spinner**.
- The Advanced Settings tab shows duplicated workspaces (e.g., two entries for `neo`, an entry for `workspace.json`, or a stale `ticket-intake` entry).
- Clicking any of these throws: `Something went wrong: TypeError: Cannot read properties of null (reading '__store')`.

### The Agent Check (Cosmetic vs Critical)
A perpetual loading spinner on the main view is largely cosmetic as long as the backend is healthy.
**For agents, the most critical verification is that all configured MCP server sets load.**
To verify, bypass the UI and use your healthcheck tools:
- `mcp_neo-mjs-github-workflow_healthcheck`
- `mcp_neo-mjs-knowledge-base_healthcheck`
- `mcp_neo-mjs-memory-core_healthcheck`
- `mcp_neo-mjs-neural-link_healthcheck`

The File System MCP server is an internal `Neo.ai.Agent` / local-model loop server, not a normal frontier-harness healthcheck item unless you explicitly configured that local agent profile.

If the tools pass, the backend is up. To fix the frontend UI crash, follow the playbook below.

## 4. UI Fix Playbook: Purging Ghost Workspaces

If the user wants you to fix the loading spinner UI crash, you must purge the stale arrays from the vscdb database.

### Step A: SQLite Table Wipe
Delete the corrupted `antigravityUnifiedStateSync.sidebarWorkspaces` base64 protobuf string from the global state DB. 
*(Note: paths shown are for macOS (`/Users/<name>/...`), modify accordingly for Linux/Windows).*

```bash
sqlite3 "$HOME/Library/Application Support/Antigravity/User/globalStorage/state.vscdb" "DELETE FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.sidebarWorkspaces';"
```

### Step B: Prune Ghost Workspace Storage Directories
Find and destroy orphaned workspace hashes so the IDE does not re-register them on reload:
```bash
# Find cached workspaces to inspect
find "$HOME/Library/Application Support/Antigravity/User/workspaceStorage" -name "workspace.json" 2>/dev/null

# Typically, you delete the folders containing stale mapping values like:
# {"folder": "file://.agents/skills/ticket-intake"}
```

After performing these purges, closing and restarting the IDE forces the UI to cleanly rebuild the workspace payload based only on the actively opened directory.

### Step C: UI Re-Initialization Toggles
If the spinner persists but the backend servers are healthy:
1. **The Model Toggle (Low Risk):** Switch the AI model selection in the bottom-right corner of the IDE. This forces a soft re-initialization of the active session which can sometimes clear the hung UI state.
2. **The Cache Nuke (High Risk):** Kill the IDE and purge the token and graphics caches:
   ```bash
   rm -rf ~/Library/Application\ Support/Antigravity/auth-tokens
   rm -rf ~/Library/Application\ Support/Antigravity/Cache
   rm -rf ~/Library/Application\ Support/Antigravity/GPUCache
   ```

## 5. The Fresh MCP Client Isolation Strategy (Cache Bypass)

### The Problem
Agents operating on MCP servers they themselves are connected to often suffer from "ghost bugs" — where the agent's context or cached tool definitions do not match the live server state. If you modify an MCP tool definition (e.g., adding a new parameter) and attempt to test it via your own primary connection, you will hit a stale cache window. The server has updated, but your host client has not re-handshaked to discover the new shape.

### The Fix
Never use your own primary tool surface to validate tool-shape changes on the server you are modifying. Instead, use the **Fresh MCP Client Isolation Strategy**.

The `ai/mcp/client` infrastructure allows you to spawn a completely clean, isolated client-server connection, bypassing the agent's primary long-lived host connection.

**Empirical Verification Example:**
To verify a tool shape change (e.g., in `memory-core`), spawn a fresh client via CLI:
```bash
node ai/mcp/client/mcp-cli.mjs --server memory-core --call-tool "your_modified_tool" '{"param": "test"}'
```
This forces a clean handshake, parsing the live tool definitions directly from the server process, proving whether your tool-shape changes are actually valid without restarting the entire IDE harness.
