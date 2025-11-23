# The Memory Core Server

The **Memory Core Server** (`neo.mjs-memory-core`) is the AI agent's "Hippocampus" — its long-term memory center. It acts as a persistent state layer that allows agents to remember past interactions, learn from previous decisions, and maintain context across different development sessions.

## Purpose

Without memory, every session is a blank slate. An agent fixing a bug today has no recollection of the similar bug it fixed last week. The Memory Core solves this by persisting:
*   **Interactions:** Every prompt, thought process, and response is stored as a raw memory.
*   **Decisions:** The reasoning behind *why* a certain approach was chosen.
*   **Summaries:** High-level abstractions of entire work sessions to enable fast retrieval of past experiences.

## Architecture

The server is built on a modular service architecture, extending `Neo.core.Base`. It uses **ChromaDB** as the vector database for semantic search and **Google Gemini** for text embeddings and summarization.

### Key Services

*   **`MemoryService`**: Manages raw, granular memories. It handles the ingestion of new agent interactions and performs semantic searches across the raw interaction history.
*   **`SessionService`**: Responsible for the "Auto-Discovery" process. It uses an LLM to analyze completed sessions and generate structured summaries (Title, Category, Quality Scores) to make them easily searchable.
*   **`SummaryService`**: Manages the high-level session summaries. It provides tools to query past work based on topics or categories (e.g., "refactoring", "bugfix").
*   **`DatabaseLifecycleService`**: Manages the underlying ChromaDB process. It can start, stop, and monitor the database status, ensuring the persistence layer is available when needed.
*   **`HealthService`**: A gatekeeper that ensures all dependencies (ChromaDB connectivity, Collections, API Keys) are healthy before allowing operations.

## The "Save-Then-Respond" Protocol

The most critical operational rule for the Memory Core is the **Transactional Memory Protocol**.
To ensure a complete history, agents are required to follow a strict loop for every interaction turn:

1.  **Think:** Analyze the user's request.
2.  **Act:** Execute tools and gather information.
3.  **Consolidate:** Formulate the final response.
4.  **Save (`add_memory`):** Persist the *entire* turn (Prompt + Thought + Response) to the database.
5.  **Respond:** Only *after* the save is confirmed, deliver the response to the user.

**Why?** This ensures that the agent's *internal reasoning* (the "Thought") is saved, not just the final output. This is crucial for self-improvement, allowing the agent to analyze its own logic later.

## Session Summarization (Auto-Discovery)

The Memory Core is **self-organizing**.
When the server starts, the `SessionService` automatically scans for previous sessions that haven't been summarized yet. It uses **Gemini 2.5 Flash** to analyze the raw interaction logs and generate a structured summary containing:

*   **Title:** A concise name for the session (e.g., "Fixing Button Click Event").
*   **Category:** One of: `bugfix`, `feature`, `refactoring`, `documentation`, `new-app`, `analysis`, `other`.
*   **Quality Metrics:** Scores (0-100) for **Productivity**, **Complexity**, and **Quality**.
*   **Summary:** A high-level textual overview of what was achieved.
*   **Technologies:** A list of key technologies or modules touched during the session.

This means the agent starts every new session with an indexed "Recap" of its past work, ready to pick up where it left off.

## Tools

The server exposes a suite of tools via the Model Context Protocol (MCP).

### Memory Operations

*   **`add_memory`**: The core persistence tool. Saves the `{prompt, thought, response}` triplet.
*   **`get_session_memories`**: Retrieves the full chronological history of a specific session. Useful for context recovery.
*   **`query_raw_memories`**: Performs a semantic vector search across *all* raw memories. Use this to find specific details (e.g., "What was the error message in the grid component?").

### Summary Operations

*   **`query_summaries`**: Performs a semantic vector search across session summaries. Use this to find relevant *past sessions* (e.g., "Have I worked on the Grid component before?").
*   **`get_all_summaries`**: Lists all session summaries, sorted by date.
*   **`delete_all_summaries`**: A destructive tool to clear the summary index (useful if you want to re-summarize everything with a new model).
*   **`summarize_sessions`**: Manually triggers the summarization process for specific or all pending sessions.

### Database Management

*   **`healthcheck`**: Diagnostics tool. Checks ChromaDB status, collection health, and API key configuration.
*   **`start_database`**: Starts the local ChromaDB process.
*   **`stop_database`**: Stops the local ChromaDB process.
*   **`export_database`**: Exports memories and summaries to JSONL files for backup.
*   **`import_database`**: Imports data from JSONL backups.

## Two-Stage Query Workflow

Effective agents use the search tools in a "Zoom In / Zoom Out" sequence:

1.  **Stage 1 (Zoom Out):** Use **`query_summaries`** to find a relevant previous session.
    *   *Query:* "Refactoring the virtual list implementation"
    *   *Result:* "Session #42: Grid Virtualization Refactor"
2.  **Stage 2 (Zoom In):** Use **`query_raw_memories`** (optionally filtered by that `sessionId`) to retrieve specific code snippets or decision logic.
    *   *Query:* "Why did I use a Map instead of an Object for item lookup?"
    *   *Result:* Specific thought process from Session #42 explaining the performance benefits.

## Internals: Text Embeddings & ChromaDB

The server uses **ChromaDB** as its embedding store.

*   **`TextEmbeddingService`**: Wraps the `text-embedding-004` model from Google. It converts all text (prompts, thoughts, summaries) into high-dimensional vectors.
*   **`ChromaManager`**: A singleton that manages the connection to ChromaDB. It lazily initializes two collections:
    *   `neo-agent-memory`: Stores the raw interaction logs.
    *   `neo-agent-sessions`: Stores the generated summaries.

## Configuration

The server supports loading a custom configuration file via the `-c` or `--config` CLI flag. This allows you to override default settings such as the database port, embedding model, or backup paths without modifying the source code.

### Usage

```bash readonly
node ai/mcp/server/memory-core/mcp-stdio.mjs -c ./my-config.json
```

### Configuration File Format

You can provide a JSON file or an ES Module (`.mjs`) that exports a configuration object. The custom configuration is deep-merged with the default settings.

**Example `my-config.json`:**

```json readonly
{
    "debug": true,
    "modelName": "gemini-2.5-pro",
    "memoryDb": {
        "port": 8005,
        "collectionName": "my-custom-memory"
    }
}
```

This flexibility is crucial for:
*   **Custom Models:** Switching to a different Gemini model version.
*   **Port Conflicts:** Running multiple instances or avoiding conflicts with other services.
*   **Environment Specifics:** Adjusting paths for different deployment environments.

## Powered by Neo.mjs

This server isn't just a standard Node.js application; it demonstrates the versatility of the Neo.mjs framework beyond the browser. By leveraging the **Neo.mjs Class System** for backend services, the server achieves a robust and maintainable architecture.

### 1. Singleton Services

Every service (e.g., `SessionService`, `MemoryService`) is a **Neo.mjs Singleton**. This ensures a single source of truth for application state, global accessibility, and consistent lifecycle management without the need for complex dependency injection frameworks.

### 2. Asynchronous Initialization (`initAsync`)

The server relies on the framework's `initAsync()` lifecycle hook to orchestrate complex dependency chains without race conditions.
*   `ChromaManager` establishes the database connection.
*   `DatabaseLifecycleService` waits for `ChromaManager` and ensures the DB process is running.
*   `SessionService` waits for the DB to be ready before starting the auto-discovery summarization.

All of this happens automatically during the startup sequence, ensuring a fully initialized environment before the first tool call is accepted.

### 3. Reactive Configurations

The server uses Neo.mjs **Reactive Configs** to manage state. Configuration properties (like `model_` or `connected_`) automatically generate getters, setters, and change hooks (`afterSet...`). This allows services to react dynamically to environment changes or state transitions (e.g., re-initializing a model if the API key changes) with clean, declarative code.
