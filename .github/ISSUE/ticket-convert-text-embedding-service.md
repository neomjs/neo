---
title: "Convert textEmbeddingService to TextEmbeddingService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7546

**Epic:** 7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/memory-core/services/textEmbeddingService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `TextEmbeddingService.mjs` to follow a more consistent naming convention. This service handles creating embedding vectors for text.

## Acceptance Criteria

1.  A new file `ai/mcp/server/memory-core/services/TextEmbeddingService.mjs` is created with the refactored `TextEmbeddingService` class content.
2.  The `TextEmbeddingService` class extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`getEmbeddingModel`, `embedText`) are converted into class methods.
4.  The old file `ai/mcp/server/memory-core/services/textEmbeddingService.mjs` is deleted.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `TextEmbeddingService` singleton and map its methods (if any are exposed as tools).
6.  Any other services that depend on `textEmbeddingService` are updated to use the new `TextEmbeddingService` singleton instance.
7.  All related functionalities continue to work correctly after the refactoring.
