---
id: 7580
title: Add Frontmatter to Synchronized Release Notes
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:27:19Z'
updatedAt: '2025-10-21T09:09:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7580'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-21T09:09:47Z'
---
# Add Frontmatter to Synchronized Release Notes

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

To improve the structure and utility of the locally synchronized release notes, we should add YAML frontmatter containing key metadata. This change also standardizes the frontmatter convention across the entire sync service.

During implementation, a broader strategic decision was made to align all frontmatter keys with the `camelCase` format used by the source GitHub API (`gh` CLI). This improves maintainability and reduces transformation logic.

## Acceptance Criteria

1.  The `#syncReleaseNotes` method in `SyncService.mjs` is updated to fetch `tagName`, `name`, and `publishedAt` and save them as `camelCase` YAML frontmatter.
2.  The `#formatIssueMarkdown` method is refactored to use `camelCase` for all its frontmatter keys (e.g., `createdAt`, `commentsCount`) instead of `snake_case`, ensuring consistency.
3.  The `gray-matter` library is used to stringify the content with the fetched metadata as YAML frontmatter for both issues and release notes.
4.  The filename convention for release notes is confirmed to be clean and predictable (e.g., `v10.9.0.md` from a `v10.9.0` tag).

