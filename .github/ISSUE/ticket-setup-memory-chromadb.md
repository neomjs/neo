# Ticket: Set up Memory ChromaDB

GH ticket id: #7317

**Epic:** AI Knowledge Evolution
**Phase:** 1
**Status:** To Do

## Description

This ticket covers the initial setup of a new, dedicated ChromaDB instance to serve as the persistent memory for the AI agent. This database will be separate from the existing framework knowledge base.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/setupMemoryDB.mjs`) to initialize the ChromaDB client for the memory store.
2.  The script should create a new ChromaDB collection specifically for agent memories (e.g., `neo-agent-memory`).
3.  Configuration for the memory database (e.g., path, collection name) should be managed in a central location.
