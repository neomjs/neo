# Agent-Agnostic MCP Server Configuration

This guide explains the agent-agnostic Model Context Protocol (MCP) server configuration system for Neo.mjs, enabling any AI agent to discover and connect to the project's AI tooling infrastructure.

## Overview

The Neo.mjs project provides multiple AI services through MCP (Model Context Protocol) servers. These servers give AI agents the tools and context needed to perform complex software engineering tasks. The primary servers include:

- **Knowledge Base Server**: Provides semantic search across the entire codebase, documentation, guides, and examples.
- **Memory Core Server**: Offers persistent memory for AI agents, storing conversation history and session context.
- **GitHub Workflow Server**: Enables interaction with the GitHub repository, including managing issues and pull requests.
- **Neural Link Server**: Inspects and manipulates live Neo application state. External clients can add optional servers such as Chrome DevTools alongside Neo's four frontier-harness servers.

To ensure these services are accessible to any AI agent, the project uses a simple, standardized configuration format that allows an agent's client environment to launch and communicate with these servers. This guide outlines the schema for this configuration and explains how it enables an "agent-agnostic" approach to tooling.

## Configuration Principle

Instead of a repository-owned universal configuration file, each agent client owns the definition that launches its MCP servers. This preserves one common process contract without pretending that every harness has the same config path.

For Antigravity 2.x, the documented authorities are global `~/.gemini/config/mcp_config.json` and workspace `.agents/mcp_config.json`. Choose one owner for a given server; defining the same server in both scopes can create duplicate subprocesses. Antigravity CLI preferences live separately at `~/.gemini/antigravity-cli/settings.json`. See the current [Antigravity MCP documentation](https://antigravity.google/docs/mcp).

Consumer Gemini CLI service [transitioned to Antigravity CLI on 2026-06-18](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/). Enterprise and explicit API-key Gemini CLI profiles remain separate supported cases, but Neo no longer ships a workspace MCP template for them.

## The Lifecycle Protocol

The agent's client environment is responsible for managing the server lifecycle. The protocol is straightforward:

1.  **Read Configuration**: On startup, the client reads its own selected MCP authority.
2.  **Launch Servers**: For each server defined in the `mcpServers` section, the client executes the specified `command` with its `args` as a separate process.
3.  **Establish Communication**: The client communicates with the launched server process over standard input/output (stdio). The MCP SDK handles the complexities of this communication channel.
4.  **Discover Tools**: Once the channel is established, the agent can then use tools like `ListTools` to discover the server's capabilities directly through the established MCP channel.

This approach removes the burden of health checks, port management, and connection protocols from the agent, which can simply focus on using the provided tools.

## Configuration Schema

The configuration schema is minimal and focuses only on how to launch the server process. However, it is part of a broader conceptual schema for defining servers.

### Server Definition
A server can be defined with the following properties. While the current implementation primarily uses `command` and `args`, the other properties are valuable for documentation, discovery, and potential future enhancements.

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Human-readable name of the server. |
| `description` | string | | A brief explanation of what the server provides. |
| `command` | string | ✓ | The command to execute to start the server (e.g., `npm`, `npx`). |
| `args` | array | ✓ | An array of string arguments to pass to the command. |
| `type` | enum | | Defines the transport protocol for communication. While our current servers implicitly use `stdio` (managed by the SDK and client), other valid types from the MCP specification include `streamable-http` or `sse`. This property is key for a client to know how to communicate with the server. |
| `instructions` | string | | Human-readable instructions for manual setup or troubleshooting if the server fails to start automatically. |
| `capabilities` | array | | Declares the MCP capabilities the server supports, e.g., `["tools", "resources"]`. |
| `tags` | array | | Keywords for categorizing the server, useful for discovery in UIs. |

### Example (`mcp_config.json`)
The following is a practical Antigravity 2.x shape for either the global or workspace authority. It focuses purely on the properties needed to launch the servers.

```json
{
    "mcpServers": {
        "chrome-devtools": {
            "command": "npx",
            "args"   : ["-y", "chrome-devtools-mcp@latest"]
        },
        "neo.mjs-github-workflow": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-github-workflow"]
        },
        "neo.mjs-knowledge-base": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-knowledge-base"]
        },
        "neo.mjs-memory-core": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-memory-core"],
            "env"    : {"NEO_AGENT_IDENTITY": "<YOUR_AGENT_GITHUB_LOGIN>"}
        },
        "neo.mjs-neural-link": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-neural-link"]
        }
    }
}
```

## Server-Side Implementation: The SDK-First Approach

The simplicity of the client-side configuration is made possible by the server-side architecture, which is built using the `@modelcontextprotocol/sdk`.

Key components of a server include:

1.  **Dual Transport Architecture**: The servers are built to support multiple transport layers depending on the environment:
    *   **`StdioServerTransport`**: The default behavior. Servers communicate over the standard input/output of their process. This eliminates the need for port management and network configuration, making it perfect for local CLI agents.
    *   **`StreamableHTTPServerTransport`**: Configurable via the server-side `transport: 'streamable-http'` setting. The servers dynamically load an Express app and expose a unified `/mcp` endpoint. This is essential for deploying the servers as containerized microservices (e.g., Docker) where `stdio` is not accessible to remote agents. Client-side `type: 'sse'` remains a distinct legacy transport for endpoints that actually implement it.

2.  **`openapi.yaml`**: Each server has an OpenAPI 3 specification that defines the tools it provides. The `operationId` of each path becomes the tool's name, and the schema and description are used to generate the tool manifest for the agent. This provides a structured, language-agnostic way to define capabilities.

3.  **`toolService.mjs`**: A generic service reads the `openapi.yaml` file and maps the `operationId` of each tool to its actual JavaScript implementation. This decouples the tool definition from its implementation.

This architecture allows each MCP server to be a self-contained, standalone application whose lifecycle can be managed by any client environment capable of spawning a process and communicating over stdio.

## Benefits of the New Approach

1.  **Simplified Client Configuration**: The agent's client only needs to know how to start a process, not how to connect to a network service.
2.  **Robustness**: Eliminates network-related issues like port conflicts. Communication is handled by the robust MCP SDK.
3.  **True Agnosticism**: Any agent client can run the servers as long as it can read a simple JSON config and spawn a child process.
4.  **Single Source of Truth**: The `openapi.yaml` file in each server is the definitive source for the tools it provides, ensuring consistency.

## See Also

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Chrome DevTools MCP Server Guide](./ChromeDevToolsMcpServer.md)
- [Strategic AI Workflows](./StrategicWorkflows.md)
