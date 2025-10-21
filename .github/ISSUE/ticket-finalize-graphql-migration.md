---
title: "Finalize GraphQL Migration & Cleanup"
labels: enhancement, AI
---

GH ticket id: #7595

**Epic:** #7590
**Assignee:** tobiu
**Status:** To Do

## Description

This is the final ticket in the GraphQL migration epic. It covers the final cleanup and verification steps to ensure the migration is complete and the codebase is consistent.

## Acceptance Criteria

1.  A full review of all migrated services (`IssueService`, `LabelService`, `PullRequestService`, `SyncService`) is conducted to ensure no unnecessary `gh` CLI calls remain for remote data operations.
2.  The old generic `#ghCommand` helper method is confirmed to be removed.
3.  All relevant JSDoc comments throughout the services are updated to reflect the new GraphQL data access patterns and return structures.
4.  The `openapi.yaml` file is reviewed and updated to reflect any changes in the data structures returned by the services.
