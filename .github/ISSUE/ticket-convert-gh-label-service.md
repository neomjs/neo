---
title: "Convert labelService to LabelService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7558

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/github-workflow/services/labelService.mjs` into a singleton `LabelService` class that extends `Neo.core.Base`. This service is responsible for listing repository labels.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/labelService.mjs` is renamed to `LabelService.mjs`.
2.  The content is replaced with a `LabelService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `listLabels` function is converted into a class method.
4.  The `listLabels` method is updated to return a structured error object on failure, instead of throwing an exception.
5.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `LabelService` class.
6.  The `list_labels` tool continues to function correctly after the refactoring.
