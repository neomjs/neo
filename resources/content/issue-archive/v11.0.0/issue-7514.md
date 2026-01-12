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
blockedBy: []
blocking: []
closedAt: '2025-10-16T12:41:48Z'
---
# Enhance All Tools with In-Spec Manuals

Based on a design review, we have established a best practice for documenting MCP tools for AI agents: the `description` field in the `openapi.yaml` specification should serve as a comprehensive user manual, not just a brief summary.

This ticket covers the work to apply this standard to all tools in the Knowledge Base MCP server, ensuring each tool's definition includes strategic guidance, usage patterns, and examples.

## Acceptance Criteria

1.  The `openapi.yaml` file for the `knowledge-base` server is reviewed.
2.  The `description` for each operation (`sync_database`, `create_knowledge_base`, `embed_knowledge_base`, `delete_database`, etc.) is expanded into a full manual using Markdown sections.
3.  The manuals explain the tool's purpose, when to use it, what it does behind the scenes (e.g., "this orchestrates the create and embed tools"), and any potential side effects (e.g., "this is a destructive operation").
4.  The `query_documents` description, which already follows this pattern, can be used as a template.

## Timeline

- 2025-10-16T12:37:32Z @tobiu assigned to @tobiu
- 2025-10-16T12:37:33Z @tobiu added the `documentation` label
- 2025-10-16T12:37:33Z @tobiu added parent issue #7501
- 2025-10-16T12:37:34Z @tobiu added the `enhancement` label
- 2025-10-16T12:37:34Z @tobiu added the `ai` label
- 2025-10-16T12:41:45Z @tobiu referenced in commit `4c9b2bd` - "Enhance All Tools with In-Spec Manuals #7514"
- 2025-10-16T12:41:49Z @tobiu closed this issue

