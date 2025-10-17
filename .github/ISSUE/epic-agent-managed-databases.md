---
title: "Epic: Implement Agent-Managed Database Tools"
labels: epic, AI
---

GH ticket id: #7529

**Assignee:** tobiu
**Status:** To Do

## Scope

Enhance the `knowledge-base` and `memory-core` MCP servers with tools that allow an AI agent to start and stop their respective ChromaDB instances. The servers will still connect to pre-existing databases if available, but will now provide the agent with the capability to manage the database lifecycle itself. This hybrid approach offers maximum flexibility for both developers and agents.

## Top-Level Items

- `ticket-kb-add-db-tools.md`: Add `start/stop_database` tools to the Knowledge Base server.
- `ticket-mc-add-db-tools.md`: Add `start/stop_database` tools to the Memory Core server.
- `ticket-kb-make-start-hybrid-aware.md`: Make the `start_database` tool hybrid-aware.
