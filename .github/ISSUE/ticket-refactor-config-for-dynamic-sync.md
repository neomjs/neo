---
title: "Refactor Sync Config for Dynamic Date-Based Syncing"
labels: enhancement, AI
---

GH ticket id: #7571

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

To make the issue synchronization process scalable and efficient, we need to move away from a static release list and instead use a date-based approach to limit the scope of the sync. This involves removing the hardcoded `releases` array from the configuration and replacing it with a single `syncStartDate`.

## Acceptance Criteria

1.  The `ai/mcp/server/config.mjs` file is updated.
2.  The `githubWorkflow.issueSync.releases` array is **removed**.
3.  A new string property, `githubWorkflow.issueSync.syncStartDate`, is added. Its value should be set to a reasonable default, like `'2024-01-01T00:00:00Z'`, to limit the sync to recent v10+ issues.

## Benefits

-   Decouples the sync logic from a static, manually maintained list of releases.
-   Provides a single, simple configuration point for controlling the time window of the synchronization.
-   Paves the way for the service to dynamically fetch release data from GitHub.
