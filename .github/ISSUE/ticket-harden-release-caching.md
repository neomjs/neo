---
title: "Harden Release Caching and Add Fallback"
labels: enhancement, AI
---

GH ticket id: #7578

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

The `#fetchAndCacheReleases` method needs to be hardened to handle the edge case where no releases are found after the `syncStartDate`. Additionally, the fallback version for archiving should be made configurable.

## Acceptance Criteria

1.  A new property, `defaultArchiveVersion`, is added to the `githubWorkflow.issueSync` object in `config.mjs` with a value like `'unversioned'`.
2.  The `#fetchAndCacheReleases` method in `SyncService.mjs` is updated to log a warning if `this.releases` is empty after filtering.
3.  The `#getIssuePath` method is updated to use the new `defaultArchiveVersion` from the config as its fallback value instead of the hardcoded `'unknown'`.
