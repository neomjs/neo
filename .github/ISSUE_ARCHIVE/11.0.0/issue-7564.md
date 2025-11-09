---
id: 7564
title: 'Epic: Implement Two-Way GitHub Synchronization for Issues'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T11:17:27Z'
updatedAt: '2025-10-24T09:32:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7564'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 7565
  - 7566
  - 7567
  - 7568
  - 7569
  - 7570
  - 7571
  - 7572
  - 7573
  - 7574
  - 7575
  - 7576
  - 7578
  - 7579
  - 7580
  - 7581
  - 7582
  - 7583
  - 7584
  - 7585
  - 7587
  - 7588
  - 7589
subIssuesCompleted: 23
subIssuesTotal: 23
closedAt: '2025-10-24T09:32:21Z'
---
# Epic: Implement Two-Way GitHub Synchronization for Issues

**Reported by:** @tobiu on 2025-10-20

---

**Sub-Issues:** #7565, #7566, #7567, #7568, #7569, #7570, #7571, #7572, #7573, #7574, #7575, #7576, #7578, #7579, #7580, #7581, #7582, #7583, #7584, #7585, #7587, #7588, #7589
**Progress:** 23/23 completed (100%)

---

This epic outlines the implementation of a robust, bi-directional synchronization mechanism for GitHub issues, enabling them to be stored and edited as local Markdown files.

The core architecture follows a **GitHub-First** model for creation, combined with a powerful local sync capability for content editing. This hybrid approach ensures data integrity and a seamless workflow for both AI agents and human developers.

A new, dedicated `SyncService` will be created within the `github-workflow` MCP server to manage all synchronization logic. This service will be stateful, using a central metadata file to track changes efficiently and prevent unnecessary API calls.

## Phase 1: Core Issue Synchronization

This initial phase focuses on building the complete, end-to-end synchronization workflow for GitHub Issues.

### Key Architectural Pillars:

1.  **API-First Issue Creation:** New issues will be created directly via the GitHub API (using the `gh` CLI). This guarantees a single source of truth for issue numbers and initial metadata. A dedicated `create_issue` tool will be implemented for this.
2.  **Dedicated Sync Service:** A new `SyncService` singleton, built on `Neo.core.Base`, will encapsulate all sync logic. It will be exposed via a `sync_issues` tool.
3.  **Stateful, Metadata-Driven Sync:** A central `.github/.sync-metadata.json` file will store the last sync time and the state of each issue, enabling efficient, delta-based updates.
4.  **Push-Then-Pull Logic:** The sync process will first push any local changes (detected via file modification times) before pulling the latest updates from GitHub to minimize conflicts.
5.  **Structured Local Storage:** Issues will be stored as `.md` files with YAML frontmatter for metadata and inlined comments, creating a complete, self-contained record.
6.  **Automated Archiving:** Closed issues will be automatically moved to versioned archive directories (e.g., `.github/ISSUE_ARCHIVE/v11.0/`) based on their milestone or closed date.

## Phase 2: Future Enhancements

Once the core issue synchronization is stable and robust, we will expand its capabilities.

-   **Pull Request Synchronization:** Implement a parallel sync mechanism for Pull Requests, storing their conversations, reviews, and diffs as local Markdown files in a `.github/PULL_REQUESTS/` directory.
-   **Comment Push:** Investigate and implement a mechanism to push new comments from the local `.md` files back to GitHub. This is a complex task that requires careful parsing and state management.
-   **Knowledge Base Integration:** Integrate the locally stored issue and PR files into the AI Knowledge Base build process, making them queryable for deep contextual understanding.

## Comments

### @tobiu - 2025-10-24 09:32

epic resolved, there will be new tickets for the new mcp server.

