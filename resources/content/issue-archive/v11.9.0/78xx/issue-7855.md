---
id: 7855
title: Enhance Knowledge Base Guide with 'Why' and Use Cases
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T09:04:49Z'
updatedAt: '2025-11-22T09:09:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7855'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T09:09:53Z'
---
# Enhance Knowledge Base Guide with 'Why' and Use Cases

The current guide `@learn/guides/mcp/KnowledgeBase.md` focuses heavily on the technical "what" (tools and architecture) but lacks the philosophical "why" and practical use cases that demonstrate its value in an AI-native workflow.

**Goals:**
1.  **Explain "Context Engineering":** Describe why we built this server (moving beyond brittle scripts, solving the versioning context problem).
2.  **Add Real-World Use Cases:** Illustrate how agents use the Knowledge Base for:
    -   **Discovery:** Learning new concepts.
    -   **Debugging:** Understanding historical context via tickets.
    -   **Architecture:** Grasping complex patterns (worker offloading).
3.  **Explain the "Virtuous Cycle":** Document the **Knowledge Base Enhancement Strategy** (adding JSDoc to improve future queries).
4.  **Deepen the Scoring Explanation:** Explain the *intent* behind the scoring algorithm (why we boost source/guides and penalize old tickets).
5.  **Integrate "Three Dimensions of Context":** Briefly explain how the Knowledge Base (Technical Fact) works with Memory Core (Personal History) and GitHub Workflow (Project Plan).

**References:**
- `learn/blog/context-engineering-done-right.md`
- `AGENTS_STARTUP.md`


## Timeline

- 2025-11-22T09:04:50Z @tobiu added the `documentation` label
- 2025-11-22T09:04:50Z @tobiu added the `enhancement` label
- 2025-11-22T09:04:50Z @tobiu added the `ai` label
- 2025-11-22T09:07:05Z @tobiu assigned to @tobiu
- 2025-11-22T09:08:20Z @tobiu referenced in commit `1b5066b` - "Enhance Knowledge Base Guide with 'Why' and Use Cases #7855"
### @tobiu - 2025-11-22T09:09:42Z

**Input from Gemini 2.5 pro:**

> ✦ I have further enhanced the Knowledge Base MCP Server guide (`learn/guides/mcp/KnowledgeBase.md`).
> 
> **Key Additions:**
> - **The Philosophy: Context Engineering:** Explained the shift from scripts to MCP, semantic intent, and the software versioning problem.
> - **Three Dimensions of Context:** Explained how this server fits into the broader "Context Model" alongside Memory Core and GitHub Workflow.
> - **Real-World Use Cases:** Added concrete examples for Discovery, Debugging, and Architectural Analysis.
> - **Scoring Algorithm Deep Dive:** Explained the rationale behind the boosts (inheritance, guides) and penalties (tickets).
> - **The Virtuous Cycle:** Documented the strategy for agents to enhance the knowledge base with better JSDoc.
> 
> The guide now provides both the technical reference and the strategic context required for effective use.
> Closing this ticket.
> 

- 2025-11-22T09:09:53Z @tobiu closed this issue

