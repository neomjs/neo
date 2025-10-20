---
title: "Track and Handle Failed Pushes in SyncService"
labels: enhancement, AI
---

GH ticket id: #7579

**Epic:** #7564
**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

Currently, if a local issue file is modified but the corresponding issue is deleted on GitHub, the push operation will fail silently on every sync. We need to track these failures to prevent repeated API calls and to aid in debugging.

## Acceptance Criteria

1.  The `catch` block in the `#pushToGitHub` loop is updated to log the specific error message from the `gh` command.
2.  A `push_failures` array is added to the metadata object that is managed throughout the sync process.
3.  When a push for an issue fails, its number is added to the `push_failures` array.
4.  The `#pushToGitHub` logic is updated to check if an issue number is present in the `metadata.push_failures` from the previous sync. If it is, the service should skip attempting to push it again and log a debug message.
5.  After a full sync cycle, if an issue that was previously in `push_failures` is successfully pulled (i.e., it exists on GitHub again), it should be removed from the `push_failures` list in the new metadata.
