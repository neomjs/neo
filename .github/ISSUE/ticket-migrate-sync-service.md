---
title: "Migrate SyncService to GraphQL"
labels: enhancement, AI
---

GH ticket id: #7594

**Epic:** #7590
**Assignee:** tobiu
**Status:** To Do

## Description

This is the largest part of the GraphQL migration, focusing on the complete refactoring of the `SyncService` to use the new `GraphqlService`.

## Acceptance Criteria

1.  The `#pullFromGitHub` method is rewritten to use a single, comprehensive GraphQL query that fetches a batch of issues along with their nested data, including labels, assignees, comments, and **issue relationships** (parent, children, blocking, blockedBy).
2.  The `#pushToGitHub` method is rewritten to use a GraphQL mutation to update issue titles and bodies.
3.  The `#fetchAndCacheReleases` method is rewritten to use a GraphQL query.
4.  The old `#ghCommand` helper method is removed from the service.
