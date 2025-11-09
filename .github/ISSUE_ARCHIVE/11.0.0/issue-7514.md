---
id: 7514
title: Enhance All Tools with In-Spec Manuals
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T12:37:32Z'
updatedAt: '2025-10-16T12:41:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7514'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T12:41:48Z'
---
# Enhance All Tools with In-Spec Manuals

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

Based on a design review, we have established a best practice for documenting MCP tools for AI agents: the `description` field in the `openapi.yaml` specification should serve as a comprehensive user manual, not just a brief summary.

This ticket covers the work to apply this standard to all tools in the Knowledge Base MCP server, ensuring each tool's definition includes strategic guidance, usage patterns, and examples.

## Acceptance Criteria

1.  The `openapi.yaml` file for the `knowledge-base` server is reviewed.
2.  The `description` for each operation (`sync_database`, `create_knowledge_base`, `embed_knowledge_base`, `delete_database`, etc.) is expanded into a full manual using Markdown sections.
3.  The manuals explain the tool's purpose, when to use it, what it does behind the scenes (e.g., "this orchestrates the create and embed tools"), and any potential side effects (e.g., "this is a destructive operation").
4.  The `query_documents` description, which already follows this pattern, can be used as a template.

