# Memory Core MCP Server API Design

This guide documents the design of the Memory Core Model Context Protocol (MCP) server API for Neo.mjs. This server provides a structured, agent-agnostic interface for AI agents to maintain persistent memory across sessions.

## Overview

The Memory Core MCP server replaces the current shell-based memory scripts (`ai:add-memory`, `ai:query-memory`, `ai:summarize-session`, `ai:export-memory`, `ai:import-memory`) with a formal REST API. This provides:

- **Structured Communication**: JSON requests/responses instead of parsing stdout
- **Better Error Handling**: Proper HTTP status codes and error messages
- **Platform Independence**: No shell-specific dependencies
- **Real-time Capabilities**: Potential for streaming and websockets
- **Interactive Documentation**: Built-in Swagger UI

## Architecture

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

### API Structure

The API follows RESTful principles with resource-oriented endpoints:

| Resource | Endpoints | Purpose |
|----------|-----------|---------|
| Health | `GET /healthcheck`, `GET /docs` | Server status and documentation |
| Memories | `POST /memories`, `GET /memories`, `POST /memories/query` | Raw interaction storage and retrieval |
| Summaries | `GET /summaries`, `DELETE /summaries`, `POST /summaries/query` | Session summary management |
| Sessions | `POST /sessions/summarize` | Session processing |
| Database | `GET /db/export`, `POST /db/import` | Backup and restore operations |

## Endpoint Specifications

### Health Endpoints

#### `GET /docs`
Serves the interactive Swagger UI for API exploration and testing.

**Response**: HTML page with embedded Swagger UI

#### `GET /healthcheck`
Confirms server health and database connectivity.

**Response 200**:
```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "collections": {
      "memories": "neo-agent-memory",
      "summaries": "neo-agent-sessions"
    }
  },
  "version": "1.0.0",
  "uptime": 3600
}
```

### Memory Endpoints

#### `POST /memories`
Adds a new agent interaction to the memory store.

**Request Body**:
```json
{
  "prompt": "How do I create a new Neo.mjs component?",
  "thought": "The user needs guidance on component creation...",
  "response": "To create a new Neo.mjs component, you can use...",
  "sessionId": "session_1696800000000"
}
```

**Response 201**:
```json
{
  "id": "mem_2025-10-08T12:00:00.000Z",
  "sessionId": "session_1696800000000",
  "timestamp": "2025-10-08T12:00:00.000Z",
  "message": "Memory successfully added"
}
```

**Migration from CLI**:
```bash
# Old way
npm run ai:add-memory -- -p "prompt" -t "thought" -r "response" -s "sessionId"

# New way
curl -X POST http://localhost:8001/memories \
  -H "Content-Type: application/json" \
  -d '{"prompt": "prompt", "thought": "thought", "response": "response", "sessionId": "sessionId"}'
```

#### `GET /memories?sessionId={id}`
Retrieves all memories for a specific session.

**Query Parameters**:
- `sessionId` (required): The session to retrieve memories for
- `limit` (optional): Maximum memories to return (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response 200**:
```json
{
  "sessionId": "session_1696800000000",
  "count": 15,
  "total": 15,
  "memories": [
    {
      "id": "mem_2025-10-08T12:00:00.000Z",
      "sessionId": "session_1696800000000",
      "timestamp": "2025-10-08T12:00:00.000Z",
      "prompt": "...",
      "thought": "...",
      "response": "...",
      "type": "agent-interaction"
    }
  ]
}
```

#### `POST /memories/query`
Performs semantic search across all memories.

**Request Body**:
```json
{
  "query": "How did I implement the MCP server configuration?",
  "nResults": 10,
  "sessionId": "session_1696800000000"
}
```

**Response 200**:
```json
{
  "query": "How did I implement the MCP server configuration?",
  "count": 5,
  "results": [
    {
      "id": "mem_2025-10-08T12:00:00.000Z",
      "sessionId": "session_1696800000000",
      "timestamp": "2025-10-08T12:00:00.000Z",
      "prompt": "...",
      "thought": "...",
      "response": "...",
      "type": "agent-interaction",
      "distance": 0.1234,
      "relevanceScore": 0.8766
    }
  ]
}
```

**Migration from CLI**:
```bash
# Old way
npm run ai:query-memory -- -q "search query" -n 10

# New way
curl -X POST http://localhost:8001/memories/query \
  -H "Content-Type: application/json" \
  -d '{"query": "search query", "nResults": 10}'
```

### Summary Endpoints

#### `GET /summaries`
Lists all session summaries with optional filtering.

**Query Parameters**:
- `limit` (optional): Maximum summaries to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `category` (optional): Filter by category (`bugfix`, `feature`, `refactoring`, etc.)

**Response 200**:
```json
{
  "count": 10,
  "total": 50,
  "summaries": [
    {
      "id": "summary_session_1696800000000",
      "sessionId": "session_1696800000000",
      "timestamp": "2025-10-08T12:00:00.000Z",
      "title": "Implement MCP Server Configuration",
      "summary": "Created agent-agnostic MCP server configuration...",
      "category": "feature",
      "memoryCount": 15,
      "quality": 85,
      "productivity": 90,
      "impact": 75,
      "complexity": 60,
      "technologies": ["neo.mjs", "nodejs", "chromadb"]
    }
  ]
}
```

#### `POST /summaries/query`
Searches session summaries semantically.

**Request Body**:
```json
{
  "query": "sessions where I worked on MCP servers",
  "nResults": 10,
  "category": "feature"
}
```

**Response 200**:
```json
{
  "query": "sessions where I worked on MCP servers",
  "count": 3,
  "results": [
    {
      "id": "summary_session_1696800000000",
      "sessionId": "session_1696800000000",
      "title": "Implement MCP Server Configuration",
      "summary": "...",
      "category": "feature",
      "quality": 85,
      "distance": 0.0987,
      "relevanceScore": 0.9013
    }
  ]
}
```

#### `DELETE /summaries`
Deletes all session summaries (raw memories are preserved).

**Response 200**:
```json
{
  "deleted": 25,
  "message": "All summaries successfully deleted"
}
```

### Session Endpoints

#### `POST /sessions/summarize`
Triggers session summarization process.

**Request Body** (optional):
```json
{
  "sessionId": "session_1696800000000"
}
```

If `sessionId` is omitted, all unsummarized sessions will be processed in batch mode.

**Response 200**:
```json
{
  "processed": 1,
  "sessions": [
    {
      "sessionId": "session_1696800000000",
      "memoryCount": 15,
      "summaryId": "summary_session_1696800000000",
      "title": "Implement MCP Server Configuration"
    }
  ]
}
```

**Migration from CLI**:
```bash
# Old way - specific session
npm run ai:summarize-session -- -s "session_1696800000000"

# New way
curl -X POST http://localhost:8001/sessions/summarize \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session_1696800000000"}'

# Old way - batch mode
npm run ai:summarize-session

# New way
curl -X POST http://localhost:8001/sessions/summarize \
  -H "Content-Type: application/json"
```

### Database Endpoints

#### `GET /db/export`
Exports the entire memory database to a JSONL file.

**Query Parameters**:
- `include` (optional): Collections to export (`memories`, `summaries`, or both)

**Response 200**:
- Content-Type: `application/x-jsonlines`
- Content-Disposition: `attachment; filename="memory-export-2025-10-08T12-00-00.jsonl"`
- Body: JSONL file with all records

**Migration from CLI**:
```bash
# Old way
npm run ai:export-memory

# New way
curl -O -J http://localhost:8001/db/export
```

#### `POST /db/import`
Imports a previously exported JSONL file.

**Request**:
- Content-Type: `multipart/form-data`
- Body: File upload with optional `mode` parameter

**Form Fields**:
- `file`: The JSONL backup file
- `mode`: `merge` (default) or `replace`

**Response 200**:
```json
{
  "imported": 150,
  "skipped": 5,
  "mode": "merge",
  "message": "Database import completed successfully"
}
```

**Migration from CLI**:
```bash
# Old way
npm run ai:import-memory -- --file path/to/backup.jsonl

# New way
curl -X POST http://localhost:8001/db/import \
  -F "file=@path/to/backup.jsonl" \
  -F "mode=merge"
```

## Error Handling

All endpoints use standard HTTP status codes:

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Data retrieved successfully |
| 201 | Created | Memory added successfully |
| 400 | Bad Request | Invalid JSON or missing required fields |
| 404 | Not Found | Session does not exist |
| 503 | Service Unavailable | Cannot connect to ChromaDB |

**Error Response Format**:
```json
{
  "error": "Database connection failed",
  "message": "Could not connect to ChromaDB on localhost:8001",
  "code": "DB_CONNECTION_ERROR"
}
```

## Implementation Considerations

### Authentication & Authorization
The initial implementation runs on `localhost:8001` with no authentication. Future versions should consider:
- API key authentication for remote access
- Rate limiting to prevent abuse
- Role-based access control for multi-user scenarios

### Performance Optimizations
- **Pagination**: Implemented for all list endpoints to handle large datasets
- **Caching**: Consider caching frequently accessed summaries
- **Batch Operations**: The summarization endpoint already supports batch mode
- **Streaming**: Future enhancement for large exports

### Database Consistency
- **Atomic Operations**: Use transactions where supported by ChromaDB
- **Validation**: Validate all inputs before database operations
- **Idempotency**: Memory IDs are timestamp-based, preventing duplicates

### Monitoring & Logging
- **Health Checks**: The `/healthcheck` endpoint should be monitored
- **Request Logging**: Log all API requests with timing information
- **Error Tracking**: Capture and log all errors with stack traces
- **Metrics**: Track memory growth, query performance, and summarization success rates

## Migration Path

The transition from CLI scripts to the MCP API will be gradual:

### Phase 1: API Design (Current)
- ✅ Design resource-oriented API structure
- ✅ Create OpenAPI 3.0 specification
- ✅ Document endpoints and data models

### Phase 2: Implementation
1. Create Express.js server scaffold
2. Implement core endpoints (POST /memories, GET /memories, POST /memories/query)
3. Implement summary endpoints
4. Implement session and database endpoints
5. Add Swagger UI documentation

### Phase 3: Integration
1. Update AGENTS.md to reference new API
2. Create helper utilities for common operations
3. Deprecate CLI scripts with warnings
4. Update all documentation and examples

### Phase 4: Cleanup
1. Remove old CLI scripts
2. Remove npm script entries
3. Archive old documentation

## OpenAPI Specification

The complete API specification is available in OpenAPI 3.0 format at:
```
buildScripts/mcp/memory/openapi.yaml
```

This specification can be:
- Used to generate client libraries in multiple languages
- Imported into API development tools (Postman, Insomnia)
- Served by the `/docs` endpoint for interactive exploration
- Used for automated API testing

## Related Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Agent-Agnostic MCP Configuration](./AgentAgnosticMcpConfig.md)
- [Knowledge Base MCP Server API Design](./KnowledgeBaseMcpApi.md) (coming soon)
- [Strategic AI Workflows](./StrategicWorkflows.md)

## See Also

- **Epic**: `.github/ISSUE/epic-architect-ai-tooling-as-mcp.md`
- **Design Ticket**: `.github/ISSUE/ticket-design-memory-mcp-api.md`
- **Current Scripts**: `buildScripts/ai/*.mjs`
- **Configuration**: `buildScripts/ai/aiConfig.mjs`