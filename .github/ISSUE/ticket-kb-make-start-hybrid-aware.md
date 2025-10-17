---
title: "Make start_database Hybrid-Aware"
labels: enhancement, AI
---

Parent epic: #7530
GH ticket id: #7532

**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

The `start_database` tool is not hybrid-aware. It doesn't check if a ChromaDB instance is already running on the target port before attempting to spawn a new one. This needs to be corrected to support developers who prefer to manage the DB process manually.

## Acceptance Criteria

1.  The `knowledgeBase` object in `ai/mcp/server/config.mjs` is updated with `host` and `port` properties.
2.  The `start_database` function in `knowledge-base/services/databaseLifecycleService.mjs` is updated.
3.  It first performs a heartbeat check on the configured host and port.
4.  If the heartbeat is successful, it returns a status indicating the database is already running and does not spawn a new process.
5.  If the heartbeat fails, it proceeds with spawning a new background process.
