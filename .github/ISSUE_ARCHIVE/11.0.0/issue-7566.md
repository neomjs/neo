---
id: 7566
title: Implement GitHub to Local Sync (Pull)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T11:22:37Z'
updatedAt: '2025-10-20T11:45:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7566'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T11:45:40Z'
---
# Implement GitHub to Local Sync (Pull)

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

This ticket covers the implementation of the "pull" half of the synchronization process. The `SyncService` will be enhanced to fetch all issues and their comments from GitHub, compare them against the local metadata, and write the content to local Markdown files.

This includes the intelligent archiving logic to keep the issue directories organized.

## Acceptance Criteria

1.  The `SyncService.runFullSync()` method is implemented to orchestrate the pull process.
2.  A private method, `#pullFromGitHub()`, is created to contain the core logic.
3.  The service uses `gh issue list --state all` to fetch all issues.
4.  For each issue, it compares the `updated_at` timestamp with the one stored in `.sync-metadata.json`.
5.  If the remote issue is newer (or not present locally), the service uses `gh issue view <N> --comments` to get the full conversation.
6.  A `#formatIssueMarkdown()` method is created, using the `gray-matter` library to generate a `.md` file with YAML frontmatter and inlined comments.
7.  A `#getIssuePath()` method is implemented to determine the correct local path for an issue (`.github/ISSUES/` for open, `.github/ISSUE_ARCHIVE/<version>/` for closed).
8.  The service correctly writes the generated Markdown to the appropriate path, creating directories as needed.
9.  After a successful pull, the `.sync-metadata.json` file is updated with the new `last_sync` time and the latest state for each issue.

## Benefits

-   Populates the local repository with a complete, queryable history of all GitHub issues.
-   Automates the organization and archiving of closed issues.
-   Creates the foundation for the AI Knowledge Base to consume issue data.

