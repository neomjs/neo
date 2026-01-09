# The Knowledge Base Server

The **Knowledge Base Server** (`neo.mjs-knowledge-base`) is the AI agent's "Technical Cortex." It provides a deep, semantic understanding of the Neo.mjs framework, enabling agents to answer questions like "How does the VDOM diffing work?" or "What is the proper way to extend a component?" with high accuracy.

## The Philosophy: Context Engineering

Traditional AI coding assistants often fail because they rely on shallow context—keyword searches or whatever file happens to be open in the editor. This approach breaks down in large, complex frameworks like Neo.mjs.

The Knowledge Base Server implements **Context Engineering**, a discipline focused on providing AI agents with the *right* context, structured in a way they can understand.

### Why We Built This

1.  **Beyond Script Brittleness:** We moved from fragile shell scripts to a robust, type-safe MCP server to ensure reliability.
2.  **Semantic Intent vs. Keywords:** A search for "table" shouldn't just find files named "table.js"—it should find `Grid`, `List`, and `Collection` because they are semantically related. Vector embeddings make this possible.
3.  **The Versioning Problem:** Agents need to know *exactly* which version of the code they are working on. By indexing the local repository state, the Knowledge Base reflects the current branch, commit, and modifications, ensuring the agent never hallucinates about features that don't exist in the current version.

### The Three Dimensions of Context

This server provides the first dimension of the Agent OS's context model:

1.  **Knowledge (The "How"):** Provided by **this server**. Immutable facts, source code, and documentation.
2.  **Memory (The "Why"):** Provided by the **[Memory Core Server](./MemoryCore.md)**. Personal history, past decisions, and reasoning chains.
3.  **Plan (The "What"):** Provided by the **[GitHub Workflow Server](./GitHubWorkflow.md)**. Formal requirements, issues, and project tracking.

## Real-World Use Cases

### 1. The Discovery Pattern (Learning)

**Goal:** An agent needs to understand how to use a specific component.  
**Query:** `query_documents(query="How do I use the Grid component?", type="guide")`  
**Result:** The server returns the "Grid" guide first, followed by relevant examples. The agent learns the *concept* before diving into the code.

### 2. Forensic Debugging (History)

**Goal:** An agent encounters a regression in the VDOM engine.  
**Query:** `query_documents(query="VDOM collision logic changes", type="ticket")`  
**Result:** The server returns closed tickets describing previous bugs and fixes. The agent learns *why* the current logic exists, preventing it from re-introducing an old bug.

### 3. Architectural Analysis (Intent)

**Goal:** An agent needs to refactor a worker.  
**Query:** `query_documents(query="worker thread communication patterns", type="src")`  
**Result:** Thanks to the **inheritance boosting** algorithm, the server returns not just the worker file, but its parent class `Neo.worker.Base` and `Neo.core.Base`, giving the agent the full architectural picture.

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

The brain of the operation. It handles the search logic and implements the **Weighted Scoring Algorithm** that makes the search "smart":
- **Hybrid Search:** Combines vector similarity (meaning) with keyword matching (precision).
- **Content Prioritization:**
    - **Boosts:** Guides (+50) and Source Code (+40) are prioritized for implementation tasks.
    - **Penalties:** Historical Tickets (-70) and Release Notes (-50) are penalized in general searches to avoid confusing the agent with outdated information, unless explicitly requested via `type='ticket'`.
    - **Inheritance:** When a class is found, its parent classes get a boost (+80). This is crucial: it ensures the agent sees the full prototype chain, understanding methods inherited from `Base` classes.

#### SearchService (`services/SearchService.mjs`)

The RAG (Retrieval-Augmented Generation) engine.
- **Synthesizes Answers:** Unlike `QueryService` which returns raw files, `SearchService` takes a question, retrieves relevant documents, reads their full content from disk, and uses an LLM (Gemini) to generate a concise, synthesized answer with citations.
- **Contextual Reading:** It reads the actual files from the filesystem before feeding them to the LLM, ensuring the context is complete and up-to-date.

#### DatabaseService (`services/DatabaseService.mjs`)

The ETL (Extract, Transform, Load) engine.
- **Extract:** Reads from `docs/output/all.json` (JSDoc), `learn/tree.json` (Guides), and `.github/` (Tickets/Releases).
- **Transform:** Normalizes content into a unified JSONL format (`dist/ai-knowledge-base.jsonl`). It generates a **Content Hash** (SHA-256) for each chunk to detect changes. It also generates a static **Class Hierarchy Map** (`dist/ai-class-hierarchy.json`).
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

*   **`ask_knowledge_base`**: **(Recommended)** Performs a semantic search and uses an LLM to synthesize an answer.
    *   `query`: The question to ask.
    *   `type`: Optional filter by content type (`guide`, `src`, `all`).
    *   *Best Practice:* Use this for "How do I..." questions to get a summarized answer with code references.

*   **`query_documents`**: Performs a raw semantic search. Returns a ranked list of relevant files.
    *   `query`: The natural language question.
    *   `type`: Filter by content type (`guide`, `src`, `ticket`, `blog`, `release`, `example`, `all`).
    *   *Best Practice:* Use this when you want to read the raw source files yourself.

*   **`get_class_hierarchy`**: Retrieves the static class inheritance tree.
    *   `root`: **Required.** The root class name to filter by (e.g., `Neo.component.Base`).
    *   *Best Practice:* Use this to discover available subclasses or understand the inheritance chain deterministically.

*   **`list_documents`**: Retrieves a paginated list of all indexed documents (for inspection).
*   **`get_document_by_id`**: Retrieves a specific document chunk by its ID.

### Database Management Tools

These tools manage the knowledge base lifecycle.

*   **`manage_knowledge_base`**: Unified tool for KB operations.
    *   `action: 'sync'`: **The "One Button" Update.** Triggers the full ETL pipeline (Create + Embed). Use this after code changes.
    *   `action: 'create'`: Runs only the extraction step.
    *   `action: 'embed'`: Runs only the embedding step.
    *   `action: 'delete'`: **Destructive.** Deletes the entire ChromaDB collection.

### Infrastructure Tools

These tools manage the underlying services.

*   **`healthcheck`**: Diagnostic tool. Checks ChromaDB connectivity, collection status, and API key presence.
*   **`manage_database`**: Manages the database process.
    *   `action: 'start'`: Starts the local ChromaDB process.
    *   `action: 'stop'`: Stops the local ChromaDB process.

## The Virtuous Cycle: Enhancing the Knowledge Base

A critical part of the workflow is that the AI agent is not just a consumer, but a **contributor** to the Knowledge Base.

1.  **Query:** The agent searches for information.
2.  **Analyze:** If the returned source code lacks comments or intent, the agent struggles.
3.  **Enhance:** The agent applies the **Knowledge Base Enhancement Strategy** (defined in `AGENTS_STARTUP.md`). It adds rich JSDoc comments, `@summary` tags, and semantic keywords to the code.
4.  **Sync:** The agent runs `sync_database`.
5.  **Improve:** The next query (by this agent or another) will find this enhanced content, yielding a higher score and better understanding.

This cycle turns technical debt into an asset, continuously improving the project's "AI-friendliness."

## Configuration: Tuning the Cortex

The server is designed to be self-contained. It manages its own database process and configuration to ensure it doesn't conflict with other services.

### Architecture: Service Isolation

The Agent OS runs multiple cognitive services. The **Knowledge Base** (technical facts) and **Memory Core** (personal history) each require their own dedicated vector storage. To prevent cross-contamination and ensure reliability, they operate as **independent services**.

**Do NOT use global environment variables** (like `CHROMA_PORT` or `CHROMA_DATA_PATH`) to configure these services, as this would force them to share the same database instance, leading to conflicts. Instead, use the dedicated configuration file.

### Key Configurable Items

The server's default configuration is defined in `ai/mcp/server/knowledge-base/config.mjs`, but you are not expected to modify this file directly. Instead, you can load a custom configuration file at runtime.

#### Loading Custom Configs

You can override any part of the default configuration by passing the `-c` or `--config` flag when starting the server. This loads a `.json` or `.mjs` file and deeply merges it with the defaults.

**Example:**
```bash readonly
npm run ai:mcp-server-knowledge-base -- -c ./my-custom-config.mjs
```

**Example `my-custom-config.mjs`:**
```javascript readonly
export default {
    // Isolate this instance on a different port
    port: 8100,
    path: './my-custom-chroma-db',
    
    // Tune the brain to be more sensitive to bug reports
    queryScoreWeights: {
        ticketPenalty: -20, // Reduce penalty from -70
        guideMatch: 60      // Increase boost from 50
    }
};
```

#### Configuration Options

*   **Database Isolation:**
    *   `port`: The port for the local ChromaDB instance (default: `8000`).
    *   `path`: The filesystem path for vector storage (default: `chroma-neo-knowledge-base`).
    *   `dataPath`: The location of the source-of-truth JSONL file.
    *   *Note:* Ensure these do not overlap with the Memory Core's configuration.

*   **Scoring Weights (`queryScoreWeights`):**
    *   You can fine-tune the brain's retrieval logic here.
    *   *Example:* Decrease `ticketPenalty` if you want the agent to focus more on historical bug reports.
    *   *Example:* Increase `sourcePathMatch` to prioritize exact file location matches.

*   **Performance:**
    *   `nResults`: Retrieval depth (default: 100).
    *   `batchSize`: Embedding throughput.

### Environment Variables

*   `GEMINI_API_KEY`: **Required.** Used for generating text embeddings.
