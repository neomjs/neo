---
id: 7567
title: Implement Local to GitHub Sync (Push)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T11:24:16Z'
updatedAt: '2025-10-22T22:53:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7567'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T11:59:56Z'
---
# Implement Local to GitHub Sync (Push)

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

This ticket covers the implementation of the "push" half of the synchronization process. The `SyncService` will be enhanced to detect local changes in the Markdown issue files and push them back to GitHub.

The sync logic will follow the "push-then-pull" model, so this push operation should be the first step in the `runFullSync` orchestration.

## Acceptance Criteria

1.  A private method, `#pushToGitHub()`, is created in the `SyncService`.
2.  This method is called by `runFullSync()` *before* the pull operation.
3.  The method scans all `.md` files in the `.github/ISSUES/` and `.github/ISSUE_ARCHIVE/` directories.
4.  For each file, it checks the file's modification time (`mtime`) against the `last_sync` timestamp in `.sync-metadata.json`.
5.  If the local file is newer, the service parses the file to extract the title and body.
    - The title should be extracted from the main `#` heading.
    - The body should be the content of the file, excluding the frontmatter and the `

