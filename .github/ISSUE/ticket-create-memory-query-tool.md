# Ticket: Create Memory Query Tool

GH ticket id: #7319

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Status:** To Do

## Description

This ticket covers the creation of a new CLI command (`npm run ai:query-memory`) that will allow the AI agent to perform semantic searches against its own memory database. This is the core of the "Recall Engine."

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/queryMemory.mjs`) and linked to an `npm` script.
2.  The script accepts a query string (`-q`) as input.
3.  It generates an embedding for the query and uses it to find the most relevant documents in the `neo-agent-memory` ChromaDB collection.
4.  The script returns a ranked list of results, similar to the existing `ai:query` tool, allowing the agent to access its most relevant memories.
