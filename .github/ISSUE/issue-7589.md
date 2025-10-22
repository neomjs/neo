---
id: 7589
title: Refactor Issue Filename Convention
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T09:33:01Z'
updatedAt: '2025-10-21T09:37:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7589'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-21T09:37:13Z'
---
# Refactor Issue Filename Convention

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

To create a more robust and scalable file naming convention, the synchronization process will be updated. This involves two key changes:
1.  **Removing Numeric Padding:** The current method of padding issue numbers (e.g., `0123.md`) imposes an arbitrary limit on the number of issues the project can have. This will be removed.
2.  **Adding a Prefix:** To avoid starting filenames with a number, which can be problematic for some shell tools, a configurable prefix (e.g., `issue-`) will be added.

The resulting convention (e.g., `issue-123.md`) is scalable, robust, and remains human-readable.

## Acceptance Criteria

1.  A new `issueFilenamePrefix` property is added to the `githubWorkflow.issueSync` object in `config.mjs` with a default value of `'issue-`.
2.  The `issueNumberPadding` property is removed from the configuration.
3.  The `#getIssuePath` method in `SyncService.mjs` is updated to construct filenames using the prefix and the raw, un-padded issue number.
4.  The sync logic must gracefully handle the transition. On the next pull, it should detect and rename any existing files that use the old padded-number format to the new prefixed format.

