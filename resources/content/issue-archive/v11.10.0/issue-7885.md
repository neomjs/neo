---
id: 7885
title: '[Docs] Refine Agent OS Technical Report (Section 2.1 & 4.1)'
state: CLOSED
labels:
  - documentation
  - Blog Post
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T19:21:24Z'
updatedAt: '2025-11-23T19:22:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7885'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T19:22:42Z'
---
# [Docs] Refine Agent OS Technical Report (Section 2.1 & 4.1)

## Description
Updates the `agent-os-technical-report.md` blog post draft to correct architectural inaccuracies and update code examples based on recent API changes.

## Changes
- **Section 2.1 (Architecture Diagram):**
    - Corrected the diagram to show the Agent OS SDK and MCP Server Layer as parallel entry points to the Service Layer.
    - Explicitly labeled the underlying data realms:
        - Knowledge Base: ChromaDB (1 Collection)
        - Memory Core: ChromaDB (2 Collections)
        - GitHub Workflow: API & Filesystem
- **Section 4.1 (Code Example):**
    - Updated the `KB_QueryService` example to use the new `limit` parameter.
    - Removed inaccurate claims about token usage for query results.
    - Refined comments to focus on "Broad Search & Filtering" as the primary benefit of Code Execution for this use case.

## Acceptance Criteria
- The architecture diagram correctly reflects the "Service vs. Server" decoupling.
- The code example in Section 4.1 is technically accurate and aligns with the current OpenAPI spec.
- Misleading claims about token costs for metadata-only queries are removed.

## Timeline

- 2025-11-23T19:21:25Z @tobiu added the `documentation` label
- 2025-11-23T19:21:26Z @tobiu added the `Blog Post` label
- 2025-11-23T19:21:26Z @tobiu added the `ai` label
- 2025-11-23T19:22:18Z @tobiu assigned to @tobiu
- 2025-11-23T19:22:38Z @tobiu referenced in commit `57469ef` - "[Docs] Refine Agent OS Technical Report (Section 2.1 & 4.1) #7885"
- 2025-11-23T19:22:43Z @tobiu closed this issue

