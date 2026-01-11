---
id: 7670
title: 'Refactor: Shorten AGENTS.md by removing query tool documentation'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-27T08:50:58Z'
updatedAt: '2025-10-27T08:59:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7670'
author: tobiu
commentsCount: 0
parentIssue: 7668
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-27T08:59:39Z'
---
# Refactor: Shorten AGENTS.md by removing query tool documentation

This ticket is part of Epic #7668 and depends on the completion of #7669.

Once the `query_documents` tool is self-documenting via its OpenAPI specification, we must refactor `AGENTS.md` to remove the redundant documentation.

### Changes Required

1.  **Remove Detailed Sections:** Delete the following sections from `AGENTS.md` under Section 3, "The Knowledge Base: Your Primary Source of Truth":
    *   "How to Interpret Query Results"
    *   All query strategy subsections ("Strategy for High-Level Conceptual Questions", "Discovery Pattern", "Targeted Content-Type Searching")
    *   "When Queries Fail to Find Information"

2.  **Replace with a Pointer:** Replace the removed content with a concise pointer to the tool's own documentation. The new section should look like this:

    ```markdown
    ### The Query Command

    Your most important tool is the local AI knowledge base. To use it, call the `query_documents` tool.

    **Critical**: The `query_documents` tool is self-documenting. Read its description carefully for:
    - How to interpret results
    - Query strategies for different scenarios
    - Content type filtering
    - Handling edge cases

    The tool contains complete guidance on effective querying. Follow its documented patterns.
    ```

This change will significantly shorten `AGENTS.md` and ensure that the tool's documentation is the single source of truth.

## Timeline

- 2025-10-27T08:50:59Z @tobiu added the `documentation` label
- 2025-10-27T08:50:59Z @tobiu added the `enhancement` label
- 2025-10-27T08:51:00Z @tobiu added the `ai` label
- 2025-10-27T08:52:12Z @tobiu assigned to @tobiu
- 2025-10-27T08:52:23Z @tobiu added parent issue #7668
- 2025-10-27T08:59:29Z @tobiu referenced in commit `634048b` - "Refactor: Shorten AGENTS.md by removing query tool documentation #7670"
- 2025-10-27T08:59:40Z @tobiu closed this issue

