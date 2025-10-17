---
title: "Use Centralized AI Config in Memory Core Services"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7528

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

Several services within the `memory-core` server are importing the old `aiConfig` from `buildScripts` instead of the new, centralized `aiConfig` located at `ai/mcp/server/config.mjs`. This ties the new server to the old build system and must be corrected.

## Acceptance Criteria

1.  The `aiConfig` import path is corrected in `chromaManager.mjs`.
2.  The `aiConfig` import path is corrected in `dbService.mjs`.
3.  The `aiConfig` import path is corrected in `healthService.mjs`.
4.  The `aiConfig` import path is corrected in `sessionService.mjs`.
5.  The `aiConfig` import path is corrected in `textEmbeddingService.mjs`.
