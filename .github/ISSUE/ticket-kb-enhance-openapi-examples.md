---
title: Enhance OpenAPI Spec with Tool Usage Examples
labels: enhancement, documentation, AI
---

Parent epic: #7501
GH ticket id: #7513

**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

The `AGENTS.md` file contains a valuable "Query Strategies" section with examples of how an agent should use the knowledge base query tool. This contextual information is currently disconnected from the tool's definition.

To make the tools more self-documenting and provide clearer guidance to future agents, we will embed these usage examples directly into the `openapi.yaml` specification for the `query_documents` tool.

## Acceptance Criteria

1.  The `openapi.yaml` file is modified.
2.  The `requestBody` for the `POST /documents/query` endpoint is enhanced with an `examples` section.
3.  The examples are sourced from the "Query Strategies" section of `AGENTS.md`, demonstrating:
    - A broad, conceptual query.
    - A query narrowed down to a specific component.
    - A query targeting a specific content type (e.g., `-t guide`).
4.  This enhancement makes the tool's intended usage clearer directly from its OpenAPI definition.
