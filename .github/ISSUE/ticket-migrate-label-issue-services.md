---
title: "Migrate Label & Issue Services to GraphQL"
labels: enhancement, AI
---

GH ticket id: #7592

**Epic:** #7590
**Assignee:** tobiu
**Status:** To Do

## Description

As part of the GraphQL migration, the `LabelService` and `IssueService` will be updated to use the new `GraphqlService` instead of making `gh` CLI calls.

## Acceptance Criteria

1.  `LabelService.listLabels` is refactored to use a GraphQL query to fetch the list of repository labels.
2.  `IssueService.addLabels` is refactored to use the `addLabelsToLabelable` GraphQL mutation.
3.  `IssueService.removeLabels` is refactored to use the `removeLabelsFromLabelable` GraphQL mutation.
4.  The old `gh` command logic is removed from these services.
