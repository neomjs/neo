---
id: 7644
title: 'Feat: Implement PR Syncer for GitHub Workflow'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T10:22:46Z'
updatedAt: '2025-10-25T10:23:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7644'
author: tobiu
commentsCount: 0
parentIssue: 7645
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Feat: Implement PR Syncer for GitHub Workflow

**Reported by:** @tobiu on 2025-10-25

---

**Parent Issue:** #7645 - Epic: Refactor and Extend GitHub Sync Service

---

As the final part of the sync service refactoring epic, this ticket introduces the new functionality to sync GitHub Pull Requests to the local filesystem.

**Tasks:**
1.  Create `ai/mcp/server/github-workflow/services/sync/PrSyncer.mjs`.
2.  Implement the logic for a 1-way pull sync of PRs. This will involve:
    -   Fetching PR data via the GraphQL API.
    -   Formatting the PR content (including metadata, description, and potentially comments) into a structured Markdown file.
    -   Saving the files to a new local directory (e.g., `.github/PULL_REQUESTS/`).
3.  Integrate the new `PrSyncer` into the main `SyncService` orchestration loop.
4.  Update the `MetadataManager` to handle metadata for synced PRs (e.g., storing `updatedAt` and `contentHash`).

