---
title: "Filter GitHub Issues by Date in SyncService"
labels: enhancement, AI
---

GH ticket id: #7573

**Epic:** #7564
**Phase:** 1
**Depends On:** #7571
**Assignee:** tobiu
**Status:** To Do

## Description

To significantly improve the performance and reduce the scope of the issue synchronization, the `#pullFromGitHub` method must be updated to process only the issues relevant to our configured time window.

## Acceptance Criteria

1.  The `#pullFromGitHub()` method in `SyncService.mjs` is updated.
2.  After fetching the full list of issues from GitHub, the method filters the array.
3.  The filter logic should only keep issues where `createdAt >= syncStartDate` OR `updatedAt >= syncStartDate`.
4.  Only the issues that pass this filter are processed for local file creation, updates, or deletion.

## Benefits

-   Drastically reduces the number of issues processed during a sync, improving performance.
-   Prevents the local repository from being cluttered with thousands of irrelevant, legacy issues.
-   Focuses the synchronization effort on active and recent work items.
