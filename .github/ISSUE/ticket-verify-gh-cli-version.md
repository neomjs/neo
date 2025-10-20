---
title: "Verify Minimum gh CLI Version Before Sync"
labels: enhancement, AI
---

GH ticket id: #7577

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

The `SyncService` depends on specific features and output formats of the GitHub CLI (`gh`). To prevent unexpected errors, we must verify that the installed version of `gh` meets the minimum requirement defined in the configuration before attempting any synchronization operations.

## Acceptance Criteria

1.  A new private method, `#verifyGhVersion()`, is added to `SyncService.mjs`.
2.  This method executes `gh --version`, parses the output to get the semantic version number.
3.  It compares the installed version against the `aiConfig.githubWorkflow.minGhVersion` from the configuration.
4.  If the installed version is lower than the minimum requirement, the method must throw a clear, informative error that includes the current version, the required version, and instructions to upgrade.
5.  The `runFullSync()` method is updated to call `#verifyGhVersion()` at the very beginning of the process, ensuring the check runs before any other logic.
