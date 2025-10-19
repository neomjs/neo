---
title: "Convert issueService to IssueService Neo.mjs Class"
labels: enhancement, AI, refactoring
---

GH ticket id: #7557

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/github-workflow/services/issueService.mjs` into a singleton `IssueService` class that extends `Neo.core.Base`. This service will handle interactions with GitHub issues, such as adding and removing labels.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/issueService.mjs` is renamed to `IssueService.mjs`.
2.  The content is replaced with an `IssueService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing functions (`addLabels`, `removeLabels`) are converted into class methods.
4.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `IssueService` class.
5.  The `add_labels` and `remove_labels` tools continue to function correctly after the refactoring.
