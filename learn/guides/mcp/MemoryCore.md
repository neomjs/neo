# The Memory Core Server

The **Memory Core Server** (`neo.mjs-memory-core`) is the AI agent's "Hippocampus" — its long-term memory center. While the Knowledge Base stores information about the *project*, the Memory Core stores information about the *agent's own experiences*.

## Purpose

Without memory, every session is a blank slate. An agent fixing a bug today has no recollection of the similar bug it fixed last week. The Memory Core solves this by persisting:
*   **Interactions:** Every prompt, thought process, and response.
*   **Decisions:** Why a certain approach was chosen.
*   **Outcomes:** Whether a fix worked or failed.

## The "Save-Then-Respond" Protocol

The most critical aspect of the Memory Core is the **Transactional Memory Protocol**.
To ensure a complete history, agents are required to follow a strict loop:

1.  **Think:** Analyze the user's request.
2.  **Act:** Execute tools and gather information.
3.  **Consolidate:** Formulate the final response.
4.  **Save (`add_memory`):** Persist the *entire* turn (Prompt + Thought + Response) to the database.
5.  **Respond:** Only *after* the save is confirmed, deliver the response to the user.

**Why?** This ensures that the agent's *internal reasoning* (the "Thought") is saved, not just the final output. This is crucial for self-improvement, allowing the agent to analyze its own logic later.

## Session Summarization (Auto-Discovery)

The Memory Core is **self-organizing**.
When the server starts, it automatically scans for previous sessions that haven't been summarized yet. It uses an LLM (Gemini 2.5 Flash) to analyze the raw interaction logs and generate a structured summary:

*   **Title:** A concise name for the session (e.g., "Fixing Button Click Event").
*   **Category:** Bugfix, Feature, Refactoring, etc.
*   **Quality Metrics:** Scores (0-100) for Productivity, Complexity, and Quality.
*   **Summary:** A high-level overview of what was achieved.

This means the agent starts every new session with a "Recap" of its past work, ready to pick up where it left off.

## Querying: Memories vs. Summaries

The server provides two distinct search tools, enabling a "Zoom In / Zoom Out" capability:

### 1. `query_summaries` (Zoom Out)
Searches the high-level session summaries. Use this to find *relevant past sessions*.

*   "Have I worked on the Grid component before?"
*   "Show me all refactoring tasks from last month."

### 2. `query_raw_memories` (Zoom In)
Searches the detailed, turn-by-turn interaction logs. Use this to find *specific details*.

*   "What was the exact error message in that Grid bug?"
*   "Why did I decide to use a `Set` instead of an `Array` in `ClassHierarchy.mjs`?"

## Two-Stage Query Workflow

Effective agents use these tools in sequence:
1.  **Search Summaries** to find a relevant previous session (e.g., "Session #42: Grid Scrolling Fix").
2.  **Search Memories** *within* that session to retrieve the specific code snippet or decision logic needed for the current task.
