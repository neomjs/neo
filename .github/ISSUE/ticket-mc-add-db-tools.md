---
title: "Add Database Management Tools to Memory Core Server"
labels: enhancement, AI
---

Parent epic: #7529
GH ticket id: #7531

**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

To give agents more control over their environment, we will add tools to the Memory Core server to start and stop its underlying ChromaDB instance.

## Acceptance Criteria

1.  A `start_database` tool is added to the `memory-core` server's `openapi.yaml`.
2.  The tool's service handler executes `chroma run --path ./chroma-memory --port 8001` as a background process.
3.  A `stop_database` tool is added, which can terminate the process started by `start_database`.
4.  The `healthcheck` tool is updated to include the running status of the database process.
5.  The new tools are implemented in a new `databaseLifecycleService.mjs`.
