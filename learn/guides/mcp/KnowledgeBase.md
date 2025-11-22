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

The server is built on two key technologies:

### 1. OpenAPI-Driven Design
Unlike typical MCP servers that hardcode their tools, this server is entirely driven by an **OpenAPI 3.0 Specification**. The `openapi.yaml` file defines the tools, their arguments, and their documentation. The server reads this spec at startup to dynamically generate:
*   **Zod Validation Schemas:** Ensuring every tool call is type-safe.
*   **JSON Tool Definitions:** For the MCP client to discover.

### 2. ChromaDB & Vector Search
The server manages a local instance of **ChromaDB**, a high-performance vector database.
*   **Embeddings:** We use Google's `text-embedding-004` model to convert code and text into high-dimensional vectors.
*   **Hybrid Search:** The server combines vector similarity (semantic match) with keyword boosting (exact match) to deliver the best results.

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

**Best Practices for Agents:**
*   **Start Broad:** Query for concepts first (e.g., "Component lifecycle").
*   **Narrow Down:** Use the results to find specific class names (e.g., "Neo.form.field.Base").
*   **Check History:** Use `type: 'ticket'` to see if a specific bug has been reported before.

### Stage 2: Querying Memory
(Handled by the [Memory Core Server](./MemoryCore.md))

## Automatic Synchronization

The server is **self-maintaining**. On startup, it runs a health check and, if necessary, triggers an automatic synchronization process (`sync_database`). This ETL (Extract, Transform, Load) pipeline:
1.  Reads the latest source code and markdown files.
2.  Generates embeddings for new or modified content.
3.  Updates the vector database.

This ensures the agent always has the most up-to-date understanding of the project, even as you modify the code.
