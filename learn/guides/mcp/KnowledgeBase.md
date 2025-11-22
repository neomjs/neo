# The Knowledge Base Server

The **Knowledge Base Server** (`neo.mjs-knowledge-base`) is the AI agent's "Technical Cortex." It provides a deep, semantic understanding of the Neo.mjs framework, enabling agents to answer questions like "How does the VDOM diffing work?" or "What is the proper way to extend a component?" with high accuracy.

## Purpose

In a traditional RAG (Retrieval-Augmented Generation) system, an agent searches for keywords. In the Agent OS, the Knowledge Base Server uses **semantic vector embeddings** to understand the *intent* behind a query.

It indexes four distinct types of content:
1.  **Source Code (`src`):** Class definitions, methods, and configs. The server pre-calculates inheritance chains, so asking about `Button` also retrieves relevant context from `component.Base`.
2.  **Guides (`guide`):** Conceptual documentation (like this file).
3.  **Tickets (`ticket`):** Historical GitHub issues (both open and closed), providing context on *why* certain decisions were made.
4.  **Release Notes (`release`):** Changelogs and feature announcements.

## Architecture

The server is built on a robust, service-oriented architecture designed for reliability and extensibility.

### 1. OpenAPI-Driven Design
Unlike typical MCP servers that hardcode their tools, this server is entirely driven by an **OpenAPI 3.0 Specification**.
- **Source of Truth:** `openapi.yaml` defines every tool, argument, and return type.
- **Dynamic Validation:** `OpenApiValidator.mjs` generates Zod schemas at runtime to ensure strict type safety for all tool calls.
- **Tool Discovery:** `toolService.mjs` dynamically maps OpenAPI operations to service handlers.

### 2. Core Services
The server logic is distributed across specialized services:

#### QueryService (`services/QueryService.mjs`)
The brain of the operation. It handles the "Two-Stage Query Protocol" (Stage 1).
- **Embeddings:** Uses Google's `text-embedding-004` model via the Gemini API to convert queries into vectors.
- **Hybrid Search:** Combines vector similarity with a sophisticated **Weighted Scoring Algorithm**:
    - **Boosts:** Matches in file paths (+40), filenames (+30), class names (+20), guides (+50).
    - **Penalties:** Tickets (-70) and Release Notes (-50) are penalized to prioritize current code and documentation, unless explicitly requested.
    - **Inheritance:** Uses pre-calculated inheritance chains to boost parent classes (+80) with a decay factor, ensuring architectural context is preserved.

#### DatabaseService (`services/DatabaseService.mjs`)
The ETL (Extract, Transform, Load) engine.
- **Extract:** Reads from `docs/output/all.json` (JSDoc), `learn/tree.json` (Guides), and `.github/` (Tickets/Releases).
- **Transform:** Normalizes content into a unified JSONL format (`dist/ai-knowledge-base.jsonl`). It generates a **Content Hash** (SHA-256) for each chunk to detect changes.
- **Load:** "Upserts" vectors into ChromaDB. It uses the content hash to perform a diff, ensuring only new or modified chunks are re-embedded, saving time and API costs.

#### HealthService (`services/HealthService.mjs`)
The gatekeeper.
- **Intelligent Caching:** Caches "healthy" status for 5 minutes to reduce overhead. Unhealthy states are never cached, allowing immediate recovery detection.
- **Gatekeeping:** Every tool call passes through `ensureHealthy()`. If dependencies (ChromaDB, API Key) are missing, it fails fast with actionable error messages.

#### DatabaseLifecycleService (`services/DatabaseLifecycleService.mjs`)
Process manager.
- Automatically manages the local `chroma` server process.
- Can start/stop the database on demand via tools.

#### DocumentService (`services/DocumentService.mjs`)
Inspection and debugging.
- Allows raw access to the indexed documents in ChromaDB to verify content and metadata.

### 3. ChromaDB & Vector Search
The server manages a local instance of **ChromaDB**, a high-performance vector database.
- **Persistence:** Data is stored locally in `chroma-neo-knowledge-base/`.
- **Collection:** Uses a single collection `neo-knowledge-base` for all content types.

## Available Tools

### Query Tools
These are the primary tools used by agents to retrieve information.

*   **`query_documents`**: Performs a semantic search.
    *   `query`: The natural language question.
    *   `type`: Filter by content type (`guide`, `src`, `ticket`, `blog`, `release`, `example`, `all`).
    *   *Best Practice:* Start broad, then narrow down. Use `type` to focus the search.

*   **`list_documents`**: Retrieves a paginated list of all indexed documents (for inspection).
*   **`get_document_by_id`**: Retrieves a specific document chunk by its ID.

### Database Management Tools
These tools manage the knowledge base lifecycle.

*   **`sync_database`**: **The "One Button" Update.** Triggers the full ETL pipeline:
    1.  Scans source files.
    2.  Creates `ai-knowledge-base.jsonl`.
    3.  Embeds changes into ChromaDB.
    *   *Use when:* You have modified code or docs and want the agent to "learn" the changes.

*   **`create_knowledge_base`**: Runs only the "Extract & Transform" steps (creates the JSONL file). Useful for debugging the extraction logic without incurring embedding costs.
*   **`embed_knowledge_base`**: Runs only the "Load" step (embeds the JSONL file). Useful if the JSONL file was manually edited or verified.
*   **`delete_database`**: **Destructive.** Deletes the entire ChromaDB collection.

### Infrastructure Tools
These tools manage the underlying services.

*   **`healthcheck`**: Diagnostic tool. Checks ChromaDB connectivity, collection status, and API key presence.
*   **`start_database`**: Starts the local ChromaDB process.
*   **`stop_database`**: Stops the local ChromaDB process.

## Configuration

The server is configured via `ai/mcp/server/knowledge-base/config.mjs` or environment variables.

**Key Environment Variables:**
*   `GEMINI_API_KEY`: **Required.** Used for generating text embeddings.
*   `CHROMA_DATA_PATH`: Path to store vector data (default: `./chroma-neo-knowledge-base`).
*   `CHROMA_PORT`: Port for the database (default: `8000`).

## The Two-Stage Query Protocol

Effective Context Engineering requires distinguishing between "Knowledge" (Technical Facts) and "Memory" (Personal History). The Knowledge Base Server handles the first stage.

### Stage 1: Querying Knowledge (`query_documents`)
This tool searches the framework's documentation and codebase.

**Example:**
```javascript
await KB_QueryService.queryDocuments({
    query: "How do I create a custom form field?",
    type: "guide" // Filter for conceptual guides
});
```

### Stage 2: Querying Memory
(Handled by the [Memory Core Server](./MemoryCore.md))