---
id: 8422
title: Update Knowledge Base Documentation
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T12:27:37Z'
updatedAt: '2026-01-08T12:29:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8422'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T12:29:34Z'
---
# Update Knowledge Base Documentation

Update `learn/guides/mcp/KnowledgeBase.md` to reflect recent architectural changes.

**Changes:**
1.  **New RAG Capability:** Document the `ask_knowledge_base` tool and the underlying `SearchService`. Explain how it differs from `query_documents` (synthesis vs. raw search).
2.  **New Hierarchy Tool:** Document the `get_class_hierarchy` tool.
3.  **Tool Consolidation:** Update the "Available Tools" section to reflect the condensed toolset (e.g., `manage_knowledge_base` instead of separate create/embed/sync tools).
4.  **Updated Usage:** Ensure examples and descriptions align with `openapi.yaml`.

**Goal:** Keep documentation in sync with the live system capabilities.

## Timeline

- 2026-01-08T12:27:38Z @tobiu added the `documentation` label
- 2026-01-08T12:27:38Z @tobiu added the `ai` label
- 2026-01-08T12:28:07Z @tobiu assigned to @tobiu
- 2026-01-08T12:29:05Z @tobiu referenced in commit `b3e5051` - "docs: Update Knowledge Base guide with new tools and services (#8422)"
### @tobiu - 2026-01-08T12:29:12Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `learn/guides/mcp/KnowledgeBase.md` to accurately reflect the current capabilities of the system.
> 
> **Updates include:**
> 1.  **New Services:** Documented `SearchService` (RAG) as a core component.
> 2.  **New Tools:**
>     *   `ask_knowledge_base`: Documented as the recommended way to get synthesized answers.
>     *   `get_class_hierarchy`: Documented as the tool for deterministic inheritance discovery.
> 3.  **Tool Consolidation:** Updated the "Available Tools" section to show the unified `manage_knowledge_base` and `manage_database` tools, replacing the list of deprecated individual tools.
> 
> I also updated `ai/mcp/server/knowledge-base/services/toolService.mjs` to register the `get_class_hierarchy` tool mapping.

- 2026-01-08T12:29:34Z @tobiu closed this issue

