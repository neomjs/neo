---
title: "Refine Issue Creation to be API-First"
labels: enhancement, AI
---

GH ticket id: #7564

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

The current workflow for creating tickets involves manually creating a Markdown file, which is error-prone (e.g., using non-existent labels). We should flip this model to be API-first, using GitHub as the initial source of truth.

This ticket proposes creating a new `create_issue` tool within the `github-workflow` server. The agent will call this tool to create issues directly on GitHub, which will then be synced back to the local repository as Markdown files.

## Acceptance Criteria

1.  A new `create_issue` method is added to the `IssueService` in the `github-workflow` server.
2.  This method uses `gh issue create` to create a new issue on GitHub, accepting parameters like `title`, `body`, `labels`, and `assignees`.
3.  The `openapi.yaml` for the `github-workflow` server is updated to include the new `create_issue` tool.
4.  Upon successful creation, the service should (ideally) trigger a sync to immediately pull the new issue down as a local `.md` file.
5.  The agent workflow documented in `AGENTS.md` is updated to reflect that creating tickets should now be done via this new tool, not by manually creating files.

## Benefits

-   **Input Validation:** Ensures all new tickets are valid at the point of creation (correct labels, assignees, etc.).
-   **Simplified Agent Workflow:** The agent interacts with a structured tool call instead of raw file creation.
-   **Single Source of Truth:** GitHub becomes the definitive source for new issue data.
