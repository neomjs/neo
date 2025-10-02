# Ticket: Create Session Summarization API

GH ticket id: #7325

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To enhance long-term memory recall and provide high-level overviews of past work, this ticket covers the creation of a script that can summarize a completed agent session.

This script will serve as a data processing tool that can be run independently, without needing a full interactive agent session. It will read all the memories for a given session, use a generative model to create a concise summary, and store that summary in a new `sessions` database collection.

This creates a powerful, two-tiered memory system: a high-level index of session summaries, and a detailed log of individual interactions.

## Workflow in Practice

1.  **Initiation:** The process is triggered via a command like `npm run ai:summarize-session -- --session-id <ID_of_session>`.
2.  **Memory Retrieval:** The script connects to the `neo-agent-memory` collection and retrieves all documents for the given session ID.
3.  **Content Aggregation:** It concatenates the `prompt`, `thought`, and `response` from all memories into a single text block.
4.  **Summarization:** It sends this text to the Gemini API with a prompt to summarize the key goals, decisions, and outcomes of the session.
5.  **Persistence:** The resulting summary is saved as a new document in a new `sessions` collection in ChromaDB.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/summarizeSession.mjs`).
2.  The script accepts a `sessionId` as a command-line argument.
3.  A new ChromaDB collection (e.g., `neo-agent-sessions`) is created to store the summaries.
4.  The script successfully retrieves memories, generates a summary via the Gemini API, and stores it in the new collection.
5.  The `aiConfig.mjs` file is updated with configuration for the new sessions collection.
