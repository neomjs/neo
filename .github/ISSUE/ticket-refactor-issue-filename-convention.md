---
title: "Refactor Issue Filename Convention"
labels: enhancement, AI
---

GH ticket id: #7589

**Epic:** #7564
**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

To create a more robust and scalable file naming convention, the synchronization process will be updated. This involves two key changes:
1.  **Removing Numeric Padding:** The current method of padding issue numbers (e.g., `0123.md`) imposes an arbitrary limit on the number of issues the project can have. This will be removed.
2.  **Adding a Prefix:** To avoid starting filenames with a number, which can be problematic for some shell tools, a configurable prefix (e.g., `issue-`) will be added.

The resulting convention (e.g., `issue-123.md`) is scalable, robust, and remains human-readable.

## Acceptance Criteria

1.  A new `issueFilenamePrefix` property is added to the `githubWorkflow.issueSync` object in `config.mjs` with a default value of `'issue-`.
2.  The `issueNumberPadding` property is removed from the configuration.
3.  The `#getIssuePath` method in `SyncService.mjs` is updated to construct filenames using the prefix and the raw, un-padded issue number.
4.  The sync logic must gracefully handle the transition. On the next pull, it should detect and rename any existing files that use the old padded-number format to the new prefixed format.
