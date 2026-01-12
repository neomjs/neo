---
id: 7575
title: Implement Release Note Synchronization
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:49:18Z'
updatedAt: '2025-10-20T13:02:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7575'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-20T13:02:58Z'
---
# Implement Release Note Synchronization

To create a complete local mirror of the project's history, we need to synchronize the release notes from GitHub to local Markdown files. This provides valuable context for the AI knowledge base and for developers working offline.

## Acceptance Criteria

1.  A new private method, `#syncReleaseNotes()`, is created in `SyncService.mjs`.
2.  This method is orchestrated by the main `runFullSync()` method.
3.  It uses `gh release list --json tagName,publishedAt` to get all releases.
4.  It filters this list to include only releases published on or after the `syncStartDate`.
5.  For each relevant release, it calls `gh release view <tagName>` to fetch the full, rendered release notes.
6.  The body of each release note is saved as a local Markdown file in the `.github/RELEASE_NOTES/` directory (e.g., `.github/RELEASE_NOTES/v10.9.0.md`).

## Benefits

-   Provides a complete, local, and queryable archive of all project release notes.
-   Enriches the AI knowledge base with high-level summaries of changes and new features for each version.
-   Improves the agent's ability to understand the evolution of the codebase over time.

## Timeline

- 2025-10-20T12:49:19Z @tobiu assigned to @tobiu
- 2025-10-20T12:49:20Z @tobiu added the `enhancement` label
- 2025-10-20T12:49:20Z @tobiu added the `ai` label
- 2025-10-20T12:49:20Z @tobiu added parent issue #7564
- 2025-10-20T13:02:36Z @tobiu referenced in commit `55084b3` - "Implement Release Note Synchronization #7575"
- 2025-10-20T13:02:58Z @tobiu closed this issue

