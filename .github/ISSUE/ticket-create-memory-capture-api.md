# Ticket: Create Memory Capture API

GH ticket id: #7318

**Epic:** AI Knowledge Evolution
**Phase:** 1
**Status:** Done

## Description

This ticket involves creating a Node.js-based internal API or script that the AI agent can use to save a "memory" into the ChromaDB instance set up in the previous ticket. This is the mechanism by which the agent's state will be persisted.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/addMemory.mjs`).
2.  The script accepts the following inputs:
    -   User Prompt (text)
    -   Agent Response (text, including tool calls)
    -   Agent Thought Process (text)
3.  The script generates a semantic embedding for the combined text content.
4.  The script saves the content and its embedding as a new document in the `neo-agent-memory` ChromaDB collection, along with metadata (e.g., timestamp, session ID).
