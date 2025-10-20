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

To improve the structure and utility of the locally synchronized release notes, we should add YAML frontmatter containing key metadata, similar to how issues are handled.

## Acceptance Criteria

1.  The `#syncReleaseNotes` method in `SyncService.mjs` is updated to fetch `tagName`, `name`, and `publishedAt` in addition to the release `body`.
2.  The `gray-matter` library is used to stringify the release `body` with the fetched metadata as YAML frontmatter.
3.  The complete content (frontmatter + body) is saved to the local `.md` file.
4.  The filename convention is clarified and implemented to be clean and predictable (e.g., `v10.9.0.md` from a `v10.9.0` tag).
