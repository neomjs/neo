---
title: "Add Frontmatter to Synchronized Release Notes"
labels: enhancement, AI
---

GH ticket id: #7580

**Epic:** #7564
**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

To improve the structure and utility of the locally synchronized release notes, we should add YAML frontmatter containing key metadata. This change also standardizes the frontmatter convention across the entire sync service.

During implementation, a broader strategic decision was made to align all frontmatter keys with the `camelCase` format used by the source GitHub API (`gh` CLI). This improves maintainability and reduces transformation logic.

## Acceptance Criteria

1.  The `#syncReleaseNotes` method in `SyncService.mjs` is updated to fetch `tagName`, `name`, and `publishedAt` and save them as `camelCase` YAML frontmatter.
2.  The `#formatIssueMarkdown` method is refactored to use `camelCase` for all its frontmatter keys (e.g., `createdAt`, `commentsCount`) instead of `snake_case`, ensuring consistency.
3.  The `gray-matter` library is used to stringify the content with the fetched metadata as YAML frontmatter for both issues and release notes.
4.  The filename convention for release notes is confirmed to be clean and predictable (e.g., `v10.9.0.md` from a `v10.9.0` tag).
