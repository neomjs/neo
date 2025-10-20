---
title: "Implement Local to GitHub Sync (Push)"
labels: enhancement, AI
---

GH ticket id: #7567

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket covers the implementation of the "push" half of the synchronization process. The `SyncService` will be enhanced to detect local changes in the Markdown issue files and push them back to GitHub.

The sync logic will follow the "push-then-pull" model, so this push operation should be the first step in the `runFullSync` orchestration.

## Acceptance Criteria

1.  A private method, `#pushToGitHub()`, is created in the `SyncService`.
2.  This method is called by `runFullSync()` *before* the pull operation.
3.  The method scans all `.md` files in the `.github/ISSUES/` and `.github/ISSUE_ARCHIVE/` directories.
4.  For each file, it checks the file's modification time (`mtime`) against the `last_sync` timestamp in `.sync-metadata.json`.
5.  If the local file is newer, the service parses the file to extract the title and body.
    - The title should be extracted from the main `#` heading.
    - The body should be the content of the file, excluding the frontmatter and the `## Comments` section.
6.  The service uses `gh issue edit <N> --title "..." --body "..."` to update the corresponding issue on GitHub.
7.  Appropriate logging is added to indicate which issues are being pushed.

## Benefits

-   Enables a true bi-directional workflow where local edits are reflected on GitHub.
-   Allows AI agents and developers to use local Markdown files as their primary editing surface.
-   Completes the core synchronization loop.
