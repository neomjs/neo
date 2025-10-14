---
title: Manage Repository Labels
labels: enhancement, AI
---

GH ticket id: #7385

**Epic:** #7477
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To fully automate the issue and PR workflow, the agent needs the ability to manage labels. This includes listing all available repository labels and adding or removing labels from a specific issue or pull request.

This ticket covers the implementation of endpoints for repository-wide label management.

## Acceptance Criteria

1.  The `openapi.yaml` is updated with endpoints for listing labels and modifying them on an issue/PR.
2.  A new `labelService.mjs` is created to wrap the `gh label list` command.
3.  A new `issueService.mjs` is created with functions to add/remove labels using `gh issue edit`.
4.  New route files and handlers are created for the `/labels` and `/issues` resources.
