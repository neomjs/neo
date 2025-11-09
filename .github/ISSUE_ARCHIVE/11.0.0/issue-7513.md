---
id: 7513
title: Enhance OpenAPI Spec with Tool Usage Examples
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T12:23:38Z'
updatedAt: '2025-10-16T12:35:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7513'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T12:35:37Z'
---
# Enhance OpenAPI Spec with Tool Usage Examples

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

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

