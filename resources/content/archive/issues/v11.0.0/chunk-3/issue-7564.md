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
  - '[x] 7565 Create Scaffold for the Issue Synchronization Service'
  - '[x] 7566 Implement GitHub to Local Sync (Pull)'
  - '[x] 7567 Implement Local to GitHub Sync (Push)'
  - '[x] 7568 Refine Issue Creation to be API-First'
  - '[x] 7569 Refactor SyncService to Use Centralized Configuration'
  - '[x] 7570 Implement and Adopt a Centralized stderr Logger'
  - '[x] 7571 Refactor Sync Config for Dynamic Date-Based Syncing'
  - '[x] 7572 Implement Dynamic Release Fetching in SyncService'
  - '[x] 7573 Filter GitHub Issues by Date in SyncService'
  - '[x] 7574 Update Archiving Logic to Use Dynamic Release Data'
  - '[x] 7575 Implement Release Note Synchronization'
  - '[x] 7576 Fix and Verify GitHub API Field Names in SyncService'
  - '[x] 7578 Harden Release Caching and Add Fallback'
  - '[x] 7579 Track and Handle Failed Pushes in SyncService'
  - '[x] 7580 Add Frontmatter to Synchronized Release Notes'
  - '[x] 7581 Add Comprehensive JSDoc to SyncService'
  - '[x] 7582 Externalize Magic Numbers and Strings in SyncService'
  - '[x] 7583 Implement Abort-on-Startup if Health Check Fails'
  - '[x] 7584 Fix Semantic Version Comparison in HealthService using ''semver'''
  - '[x] 7585 Implement Missing #checkGhAuth Method in HealthService'
  - '[x] 7587 Implement Graceful Health Handling with Recovery'
  - '[x] 7588 Enhance Sync Result Payload with Comprehensive Statistics'
  - '[x] 7589 Refactor Issue Filename Convention'
subIssuesCompleted: 23
subIssuesTotal: 23
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:32:21Z'
---
# Epic: Implement Two-Way GitHub Synchronization for Issues

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

## Timeline

- 2025-10-20T11:17:27Z @tobiu assigned to @tobiu
- 2025-10-20T11:17:28Z @tobiu added the `epic` label
- 2025-10-20T11:17:28Z @tobiu added the `ai` label
- 2025-10-20T11:20:00Z @tobiu added sub-issue #7565
- 2025-10-20T11:22:38Z @tobiu added sub-issue #7566
- 2025-10-20T11:24:18Z @tobiu added sub-issue #7567
- 2025-10-20T11:26:44Z @tobiu added sub-issue #7568
- 2025-10-20T11:27:17Z @tobiu referenced in commit `c46e8dd` - "#7564 tickets as md files"
- 2025-10-20T12:04:45Z @tobiu added sub-issue #7569
- 2025-10-20T12:16:17Z @tobiu added sub-issue #7570
- 2025-10-20T12:43:13Z @tobiu added sub-issue #7571
- 2025-10-20T12:44:58Z @tobiu added sub-issue #7572
- 2025-10-20T12:46:02Z @tobiu added sub-issue #7573
- 2025-10-20T12:48:14Z @tobiu added sub-issue #7574
- 2025-10-20T12:49:20Z @tobiu added sub-issue #7575
- 2025-10-20T12:49:57Z @tobiu referenced in commit `83a1208` - "#7564 ticket md files"
- 2025-10-20T13:21:02Z @tobiu added sub-issue #7576
- 2025-10-20T13:22:40Z @tobiu added sub-issue #7577
- 2025-10-20T13:24:09Z @tobiu added sub-issue #7578
- 2025-10-20T13:25:20Z @tobiu added sub-issue #7579
- 2025-10-20T13:27:21Z @tobiu added sub-issue #7580
- 2025-10-20T13:29:23Z @tobiu added sub-issue #7581
- 2025-10-20T13:30:44Z @tobiu added sub-issue #7582
- 2025-10-20T13:31:27Z @tobiu referenced in commit `a08874a` - "#7564 tickets as md files"
- 2025-10-20T13:34:26Z @tobiu removed sub-issue #7577
- 2025-10-20T13:37:09Z @tobiu added sub-issue #7583
- 2025-10-20T13:47:48Z @tobiu added sub-issue #7584
- 2025-10-20T13:50:50Z @tobiu added sub-issue #7585
- 2025-10-20T20:47:06Z @tobiu added sub-issue #7587
- 2025-10-21T07:55:30Z @tobiu added sub-issue #7588
- 2025-10-21T08:10:34Z @tobiu referenced in commit `1de91d6` - "#7564 new sub md file"
- 2025-10-21T09:33:03Z @tobiu added sub-issue #7589
### @tobiu - 2025-10-24T09:32:21Z

epic resolved, there will be new tickets for the new mcp server.

- 2025-10-24T09:32:21Z @tobiu closed this issue

