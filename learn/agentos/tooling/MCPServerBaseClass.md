# MCP Server Base Class (`BaseServer.mjs`)

The `BaseServer` class (`Neo.ai.mcp.server.BaseServer`) provides a standardized template-method scaffold for all Neo.mjs MCP servers (Memory Core, Knowledge Base, GitHub Workflow, Neural Link, File System).

It was introduced during the **M2 Migration Series** (Ticket #10965) to eliminate boilerplate duplication, standardize the boot lifecycle, and unify transport logic (stdio and Streamable HTTP) across the entire suite.

## Core Responsibilities

The base class lifts the following common boilerplate out of individual servers:
- **`McpServer` Construction:** Instantiating the underlying SDK server object with name, version, and capabilities.
- **Request Handlers:** Wiring up the default `ListToolsRequestSchema` and `CallToolRequestSchema` handlers.
- **Result Formatting:** Wrapping tool results or exceptions in the standard MCP envelope (`{content, isError, structuredContent?}`).
- **Health Gating:** Intercepting tool calls to execute pre-dispatch health checks, gracefully degrading unready servers instead of crashing.
- **Transport Connection:** Selecting and connecting the correct transport (`stdio` or `streamable-http`) based on runtime configuration, while rejecting every unknown server value.

## Extension Model

Per-server subclasses configure behavior by overriding specific extension hooks.

### Required Hooks

Every subclass MUST override:
- `getServerMetadata()`: Returns an object containing the server `{name, version?, capabilities?}`.
- `getToolService()`: Returns the service object exposing `{listTools, callTool}`.

### Optional Hooks

Subclasses MAY override these to augment behavior:
- `getDependentServices()`: Array of singleton services to await `.ready()` on during bootstrap. Default: `[]`.
- `getHealthService()`: Returns the health service. If `null` (default), the health gate is disabled.
- `getHealthExemptTools()`: Array of tool names allowed to bypass the health gate. Default: `['healthcheck']`.
- `wrapDispatch(dispatch)`: Wraps the tool invocation (e.g., memory-core uses this to apply `RequestContextService.run()`).
- `beforeToolDispatch(context)`: Fires **before** the health check in `CallTool`. Throwing here aborts the call as a tool error (e.g., identity spoof validation).
- `onHealthGateFailure(context)`: Fires when the health check rejects a call. Useful for telemetry (e.g., knowledge-base logging blocked dispatches).
- `logStartupStatus(health)`: Formats the post-healthcheck startup log line.
- `buildRequestContext(reqAuth)`: *(Streamable-HTTP-only)* Builds per-request context structures.
- `onSessionClosed(sessionId, mcpServerInstance)`: *(Streamable-HTTP-only)* Fired when a Streamable HTTP session disconnects.

## The Canonical Boot Sequence

The default bootstrap lifecycle executes in `boot()` (called automatically from `initAsync()`). The sequence is composed of protected building blocks:

1. `loadCustomConfig()`
2. `beforeMcpServerInit()` *(hook)*
3. `createMcpServer()` -> wires handlers
4. `waitForDependentServices()`
5. `beforeHealthcheck()` *(hook)*
6. `runHealthcheckAndLogStatus()`
7. `afterHealthcheck(health)` *(hook)*
8. `connectTransport()`
9. `afterTransportConnected()` *(hook)*

### Overriding the Boot Sequence

If a server requires a non-standard order (e.g., neural-link requires transport connection *before* service initialization to handle early MCP handshakes), the subclass should override the `boot()` method directly and re-arrange the building blocks.

> [!WARNING]
> Never override `initAsync()` to change the boot sequence. Override `boot()` instead to preserve the Neo.mjs base class promise chain (like reactive config loading).

## State Requirements

Subclasses must assign these instance members at the class-body level:
- `aiConfig`: The per-server config singleton (`null` for configuration-less servers).
- `logger`: The per-server logger module (falls back to `console.error` if omitted).

## Error Formatting

The base class guarantees standard envelope structures for failures:
- **`formatToolError(toolName, error)`**: Emitted when a tool throws.
- **`formatHealthError(toolName, error)`**: Emitted when a tool is blocked by the health gate.
