---
title: Simplify Description Handling in Zod Schema Generation
labels: enhancement, AI
---

GH ticket id: #
**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The current implementation of `describe()` calls in `buildZodSchemaFromResponse` and `buildOutputZodSchema` can be simplified for better consistency and readability. This ticket aims to centralize the application of descriptions to Zod schemas.

## Acceptance Criteria

1.  `buildZodSchemaFromResponse` is refactored to apply `schema.description` to the generated `zodSchema` consistently for all types.
2.  `buildOutputZodSchema` is refactored to ensure descriptions are applied correctly to the wrapped object for `text/plain` responses.
