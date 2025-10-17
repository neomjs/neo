---
title: "Add Database Management Tools to Knowledge Base Server"
labels: enhancement, AI
---

Parent epic: #7529
GH ticket id: #7530

**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

To give agents more control over their environment, we will add tools to the Knowledge Base server to start and stop its underlying ChromaDB instance.

## Acceptance Criteria

1.  A `start_database` tool is added to the `knowledge-base` server's `openapi.yaml`.
2.  The tool's service handler executes `chroma run --path ./chroma` as a background process.
3.  A `stop_database` tool is added, which can terminate the process started by `start_database`.
4.  The `healthcheck` tool is updated to include the running status of the database process.
5.  The new tools are implemented in a new `databaseLifecycleService.mjs`.
