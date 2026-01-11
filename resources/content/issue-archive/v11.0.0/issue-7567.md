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
blockedBy: []
blocking: []
closedAt: '2025-10-20T11:59:56Z'
---
# Implement Local to GitHub Sync (Push)

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

## Timeline

- 2025-10-20T11:24:17Z @tobiu assigned to @tobiu
- 2025-10-20T11:24:18Z @tobiu added the `enhancement` label
- 2025-10-20T11:24:18Z @tobiu added the `ai` label
- 2025-10-20T11:24:18Z @tobiu added parent issue #7564
- 2025-10-20T11:59:45Z @tobiu referenced in commit `9980bd1` - "Implement Local to GitHub Sync (Push) #7567"
- 2025-10-20T11:59:56Z @tobiu closed this issue

