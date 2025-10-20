---
title: "Fix and Verify GitHub API Field Names in SyncService"
labels: bug, AI
---

GH ticket id: #7576

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

A code review has highlighted a critical potential bug: a mismatch between the JSON fields requested from the `gh` CLI (which often use camelCase like `createdAt`) and the fields it actually returns (which may use snake_case like `created_at`). This ticket covers verifying the correct field names and standardizing their usage throughout the `SyncService` to prevent runtime errors.

## Acceptance Criteria

1.  The actual JSON output of `gh issue view <N> --json createdAt,created_at,author,user` and `gh release view <T> --json publishedAt,published_at` is inspected to definitively identify the correct field names returned by the API.
2.  All `gh` CLI calls in `SyncService.mjs` are updated to request the correct, verified field names.
3.  All property accessors within the service's logic (e.g., `issue.createdAt` vs. `issue.created_at`) are updated to match the verified API response, ensuring consistency.
4.  A new unit or integration test is created to validate the field name mappings for a sample issue and release payload, preventing future regressions.
