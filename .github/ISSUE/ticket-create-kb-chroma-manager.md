---
title: "Create ChromaManager and Adjust KB Server Entry Point"
labels: enhancement, AI
---

GH ticket id: #7549

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers two related tasks for the knowledge-base server:

1.  **Create `ChromaManager.mjs`:** A new singleton service, `Neo.ai.mcp.server.knowledgebase.service.ChromaManager`, will be created. This class will manage the connection and access to the ChromaDB collection for the knowledge base, mirroring the pattern used in the `memory-core` server.
2.  **Adjust `mcp-stdio.mjs`:** The server's entry point will be updated to import and initialize the Neo.mjs framework (`Neo`, `core`, `InstanceManager`). This is a prerequisite for using any Neo.mjs-based singleton services.

## Acceptance Criteria

1.  A new file `ai/mcp/server/knowledge-base/services/ChromaManager.mjs` is created.
2.  The `ChromaManager` class extends `Neo.core.Base`, is configured as a singleton, and correctly manages the knowledge base collection.
3.  The `ai/mcp/server/knowledge-base/mcp-stdio.mjs` file is updated to import `Neo`, `core`, and `InstanceManager`.
4.  The Neo.mjs framework is initialized correctly in `mcp-stdio.mjs` at server startup.
5.  The `DatabaseLifecycleService` is updated to use the new `ChromaManager`.
