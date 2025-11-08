# Memory Core MCP Server API Design

This guide documents the design of the Memory Core Model Context Protocol (MCP) server for Neo.mjs. This server provides a structured, agent-agnostic interface for AI agents to maintain persistent memory across sessions by exposing a collection of tools.

## Overview

The Memory Core MCP server replaces the original shell-based memory scripts (`ai:add-memory`, `ai:query-memory`, etc.) with a formal set of tools. This provides:

- **Structured Communication**: JSON-based tool calls and responses instead of parsing stdout.
- **Better Error Handling**: Clear error messages within the tool response.
- **Platform Independence**: No shell-specific dependencies.
- **Type Safety**: Tool inputs and outputs are defined by a schema.

## Architecture

The server is built using the `@modelcontextprotocol/sdk` and communicates with the client environment (e.g., Gemini CLI) over standard input/output (stdio). It no longer operates as an HTTP web server. The API is defined as a collection of tools in an `openapi.yaml` specification, which provides the single source of truth for the server's capabilities.

### Data Model

The Memory Core manages two primary ChromaDB collections:

#### 1. Memories Collection (`neo-agent-memory`)
Stores raw agent interaction data:
```json
{
  "id": "mem_2025-10-08T12:00:00.000Z",
  "sessionId": "session_1696800000000",
  "timestamp": "2025-10-08T12:00:00.000Z",
  "prompt": "User's verbatim question",
  "thought": "Agent's internal reasoning",
  "response": "Agent's final answer",
  "type": "agent-interaction"
}
```

#### 2. Summaries Collection (`neo-agent-sessions`)
Stores high-level session summaries with structured metadata:
```json
{
  "id": "summary_session_1696800000000",
  "sessionId": "session_1696800000000",
  "timestamp": "2025-10-08T12:00:00.000Z",
  "title": "Implement MCP Server Configuration",
  "summary": "Detailed session summary...",
  "category": "feature",
  "memoryCount": 15,
  "quality": 85,
  "productivity": 90,
  "impact": 75,
  "complexity": 60,
  "technologies": ["neo.mjs", "nodejs", "chromadb"]
}
```

### Available Tools

The server exposes the following tools, which are derived from its OpenAPI specification:

| Tool Name | Description |
| :--- | :--- |
| **Health** | |
| `healthcheck` | Confirms the server is running and can connect to the ChromaDB instance. |
| **Database Lifecycle** | |
| `start_database` | Starts the ChromaDB database instance as a background process. |
| `stop_database` | Stops the running ChromaDB database instance. |
| **Memories** | |
| `add_memory` | Stores a new agent interaction (prompt, thought, response) as a memory. |
| `get_session_memories` | Retrieves all memories for a specific session, in chronological order. |
| `query_raw_memories` | Performs semantic search across all raw memories using vector similarity. |
| **Summaries** | |
| `get_all_summaries` | Retrieves all session summaries, sorted by timestamp. |
| `delete_all_summaries` | Deletes all session summaries from the database. |
| `query_summaries` | Performs semantic search across session summaries. |
| **Sessions** | |
| `summarize_sessions` | Triggers the session summarization process. |
| **Database** | |
| `export_database` | Exports the entire memory database to a JSONL file. |
| `import_database` | Imports a previously exported JSONL file back into the database. |

## Tool Specifications

This section details the parameters and behavior of each tool exposed by the Memory Core server.

### Health Tools

#### `healthcheck`
Confirms server health and database connectivity. This tool takes no parameters.

### Database Lifecycle Tools

#### `start_database`
Starts the ChromaDB database instance as a background process. This tool takes no parameters.

#### `stop_database`
Stops the running ChromaDB database instance. This tool takes no parameters.

### Memory Tools

#### `add_memory`
Adds a new agent interaction to the memory store.

**Parameters**:
- `prompt` (string, required): The user's verbatim prompt.
- `thought` (string, required): The agent's internal reasoning.
- `response` (string, required): The agent's final response.
- `sessionId` (string, optional): The session ID. If not provided, one is generated.

**Migration from CLI**:
- **Old way**: `npm run ai:add-memory -- -p "..."`
- **New way**: `call_tool('add_memory', {prompt: "...", thought: "...", ...})`

#### `get_session_memories`
Retrieves all memories for a specific session.

**Parameters**:
- `sessionId` (string, required): The session to retrieve memories for.
- `limit` (integer, optional): Maximum memories to return (default: 100).
- `offset` (integer, optional): Pagination offset (default: 0).

#### `query_raw_memories`
Performs semantic search across all memories.

**Parameters**:
- `query` (string, required): The natural language search query.
- `nResults` (integer, optional): Number of results to return (default: 10).
- `sessionId` (string, optional): An optional session ID to scope the search.

**Migration from CLI**:
- **Old way**: `npm run ai:query-memory -- -q "search query"`
- **New way**: `call_tool('query_raw_memories', {query: "search query"})`

### Summary Tools

#### `get_all_summaries`
Lists all session summaries with optional filtering.

**Parameters**:
- `limit` (integer, optional): Maximum summaries to return (default: 50).
- `offset` (integer, optional): Pagination offset (default: 0).
- `category` (string, optional): Filter by category (`bugfix`, `feature`, etc.).

#### `query_summaries`
Searches session summaries semantically.

**Parameters**:
- `query` (string, required): The natural language search query.
- `nResults` (integer, optional): Number of results to return (default: 10).
- `category` (string, optional): Filter by category.

#### `delete_all_summaries`
Deletes all session summaries (raw memories are preserved). This tool takes no parameters.

### Session Tools

#### `summarize_sessions`
Triggers the session summarization process.

**Parameters**:
- `sessionId` (string, optional): If provided, only this session will be summarized. If omitted, all unsummarized sessions are processed in batch.

**Migration from CLI**:
- **Old way**: `npm run ai:summarize-session`
- **New way**: `call_tool('summarize_sessions', {})`

### Database Tools

#### `export_database`
Exports the entire memory database to a JSONL file.

**Parameters**:
- `include` (array, optional): Collections to export (`memories`, `summaries`, or both).

**Migration from CLI**:
- **Old way**: `npm run ai:export-memory`
- **New way**: `call_tool('export_database', {})`

#### `import_database`
Imports a previously exported JSONL file.

**Parameters**:
- `file` (string, required): The path to the JSONL backup file.
- `mode` (string, optional): `merge` (default) or `replace`.

**Migration from CLI**:
- **Old way**: `npm run ai:import-memory -- --file ...`
- **New way**: `call_tool('import_database', {file: "path/to/file.jsonl"})`

## Error Handling

The server no longer uses HTTP status codes. Instead, errors are communicated within the `CallToolResponse` object. If a tool call fails, the response will have `isError: true` and the `content` will contain a descriptive error message.

**Example Error Response**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Tool Error: Database connection failed. Message: Could not connect to ChromaDB."
    }
  ],
  "isError": true
}
```

## Implementation Considerations

### Authentication & Authorization
The initial implementation runs locally with no authentication. Future versions should consider:
- API key authentication for remote access
- Rate limiting to prevent abuse
- Role-based access control for multi-user scenarios

### Performance Optimizations
- **Pagination**: Implemented for all list-based tools to handle large datasets.
- **Caching**: Consider caching frequently accessed summaries.
- **Batch Operations**: The `summarize_sessions` tool supports batch mode.
- **Streaming**: Future enhancement for large exports.

### Database Consistency
- **Atomic Operations**: Use transactions where supported by the database.
- **Validation**: Validate all inputs before database operations.
- **Idempotency**: Ensure operations are idempotent where appropriate.

### Monitoring & Logging
- **Health Checks**: The `healthcheck` tool should be monitored periodically.
- **Request Logging**: Log all tool calls with timing information.
- **Error Tracking**: Capture and log all errors with stack traces.
- **Metrics**: Track memory growth, query performance, and summarization success rates.

## OpenAPI Specification

The complete API specification is available in OpenAPI 3.0 format at:
```
ai/mcp/server/memory-core/openapi.yaml
```

This specification can be:
- Used to generate client libraries in multiple languages.
- Imported into API development tools (Postman, Insomnia).
- Used for automated API testing.

## Related Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Agent-Agnostic MCP Configuration](./AgentAgnosticMcpConfig.md)
- [Knowledge Base MCP Server API Design](./KnowledgeBaseMcpApi.md) (coming soon)
- [Strategic AI Workflows](./StrategicWorkflows.md)
