# Agent-Agnostic MCP Server Configuration

This guide explains the agent-agnostic Model Context Protocol (MCP) server configuration system for Neo.mjs, enabling any AI agent to discover and connect to the project's AI tooling infrastructure.

## Overview

The Neo.mjs project provides multiple AI services through MCP servers:

- **Knowledge Base Server**: Provides semantic search across the entire codebase, documentation, guides, and examples
- **Memory Core Server**: Offers persistent memory for AI agents, storing conversation history and session context
- **Chrome DevTools Server**: Enables browser automation and debugging capabilities

To ensure these services are accessible to any AI agent (not just those from specific vendors), Neo.mjs uses a standardized, agent-agnostic configuration format.

## Configuration File Location

The MCP server configuration is located at:
```
.github/mcp-servers.json
```

This location follows the convention of placing CI/CD and development tooling configuration in the `.github/` directory.

## Discovery Protocol

AI agents should follow this discovery protocol:

1. **Locate the Configuration**: Look for `.github/mcp-servers.json` in the project root
2. **Parse the Configuration**: Read the JSON file and extract server definitions
3. **Check Server Availability**: Use the `healthCheck` configuration to verify if servers are running
4. **Start Missing Servers**: Use the `startup` commands to launch any required servers that aren't running
5. **Connect to Servers**: Use the `connection` details to establish MCP connections

## Configuration Schema

The configuration file uses the following structure:

### Root Object
```json
{
  "version": "1.0.0",
  "servers": { /* server definitions */ }
}
```

### Server Definition
Each server in the `servers` object has the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | ✓ | Human-readable name of the server |
| `description` | string | ✓ | Description of what the server provides |
| `type` | enum | ✓ | Connection type: `"command"`, `"stdio"`, or `"transport"` |
| `command` | string | * | Command to execute (required for `type: "command"`) |
| `args` | array | | Arguments to pass to the command |
| `connection` | object | * | Connection details (required for `type: "transport"`) |
| `healthCheck` | object | | Health check configuration |
| `capabilities` | array | | MCP capabilities: `["resources", "tools", "prompts", "logging"]` |
| `tags` | array | | Tags for categorizing servers |
| `startup` | object | | Information about how to start the server |

### Connection Object
For servers with `type: "transport"`:

```json
{
  "host": "localhost",
  "port": 8001,
  "protocol": "http"
}
```

### Health Check Object
```json
{
  "url": "http://localhost:8001/api/v2/healthcheck",
  "method": "GET",
  "timeout": 2000
}
```

### Startup Object
```json
{
  "command": "npm",
  "args": ["run", "ai:server-memory"],
  "cwd": ".",
  "description": "Start the ChromaDB server for AI agent memory"
}
```

## Example Implementation

Here's how an AI agent might use this configuration:

### 1. Discovery Phase
```javascript
import fs from 'fs';
import path from 'path';

// Load the configuration
const configPath = path.join(process.cwd(), '.github/mcp-servers.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log(`Found ${Object.keys(config.servers).length} MCP servers`);
```

### 2. Health Check Phase
```javascript
async function checkServerHealth(server) {
    if (!server.healthCheck) return false;
    
    try {
        const response = await fetch(server.healthCheck.url, {
            method: server.healthCheck.method || 'GET',
            signal: AbortSignal.timeout(server.healthCheck.timeout || 5000)
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Check if the memory server is running
const memoryServer = config.servers['neo-memory-core'];
const isMemoryRunning = await checkServerHealth(memoryServer);
```

### 3. Server Startup Phase
```javascript
import { spawn } from 'child_process';

async function startServer(server) {
    if (!server.startup) {
        throw new Error('Server startup configuration missing');
    }
    
    const { command, args = [], cwd = '.' } = server.startup;
    
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, { 
            cwd, 
            stdio: ['pipe', 'pipe', 'pipe'] 
        });
        
        process.on('spawn', () => {
            console.log(`Started ${server.name}`);
            resolve(process);
        });
        
        process.on('error', reject);
    });
}

// Start the memory server if not running
if (!isMemoryRunning) {
    await startServer(memoryServer);
    
    // Wait for server to be ready
    while (!(await checkServerHealth(memoryServer))) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
```

### 4. MCP Connection Phase
```javascript
// Connect to the server using MCP protocol
const mcpClient = new MCPClient({
    host: memoryServer.connection.host,
    port: memoryServer.connection.port,
    protocol: memoryServer.connection.protocol
});

await mcpClient.connect();
```

## Current Server Configurations

### Neo.mjs Knowledge Base
- **Purpose**: Semantic search across documentation, guides, examples, and source code
- **Port**: 3000
- **Startup**: `npm run ai:server`
- **Health Check**: `http://localhost:3000/api/health`

### Neo.mjs Memory Core
- **Purpose**: Persistent memory for AI agents, conversation history, session context
- **Port**: 8001  
- **Startup**: `npm run ai:server-memory`
- **Health Check**: `http://localhost:8001/api/v2/healthcheck`

### Chrome DevTools
- **Purpose**: Browser automation and debugging tools
- **Type**: Command-based (not transport)
- **Command**: `npx -y chrome-devtools-mcp@latest`

## Integration with Existing Agent Configurations

### Gemini CLI Integration
The existing `.gemini/settings.json` file can reference this configuration:

```json
{
  "mcpServers": {
    "neo-knowledge-base": {
      "command": "node",
      "args": ["buildScripts/ai/mcpAdapter.mjs", "neo-knowledge-base"]
    },
    "neo-memory-core": {
      "command": "node", 
      "args": ["buildScripts/ai/mcpAdapter.mjs", "neo-memory-core"]
    }
  }
}
```

This approach allows vendor-specific clients to leverage the standardized configuration while maintaining their own connection patterns.

## Benefits

1. **Agent Independence**: Any AI agent can discover and use Neo.mjs AI services
2. **Centralized Configuration**: Single source of truth for all MCP server definitions
3. **Standardized Discovery**: Predictable location and format for configuration
4. **Health Monitoring**: Built-in health check capabilities
5. **Startup Automation**: Automatic server startup when needed
6. **Version Tracking**: Configuration versioning for backward compatibility

## Migration from Shell-Based Tools

The existing npm scripts (`ai:query`, `ai:query-memory`, etc.) will eventually be replaced by direct MCP communication, providing:

- **Structured Data Exchange**: JSON instead of parsing stdout
- **Better Error Handling**: Proper error codes and messages
- **Real-time Capabilities**: Streaming and real-time updates
- **Cross-Platform Compatibility**: No shell-specific dependencies

## Future Extensions

This configuration system is designed to be extensible:

- **Additional Servers**: New MCP servers can be easily added
- **Custom Capabilities**: Server-specific capabilities can be defined
- **Environment Variants**: Different configurations for development, staging, production
- **Authentication**: Future support for authentication mechanisms
- **Load Balancing**: Support for multiple instances of the same server type

## See Also

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Chrome DevTools MCP Server Guide](./ChromeDevToolsMcpServer.md)
- [Strategic AI Workflows](./StrategicWorkflows.md)