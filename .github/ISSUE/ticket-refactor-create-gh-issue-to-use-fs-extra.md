---
title: Refactor createGhIssue.mjs to use fs-extra for consistency
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7391
**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 2
**Assignee:**
**Status:** To Do

## Description

The `buildScripts/ai/createGhIssue.mjs` script currently uses a mix of `fs` and `fs/promises` for file system operations. The `fs-extra` library is already a project dependency and provides a more consistent and often more convenient API for file system operations, including synchronous alternatives. This ticket is to refactor the script to exclusively use `fs-extra` for all file system interactions, improving consistency and potentially simplifying the code.

## Acceptance Criteria

1.  The `buildScripts/ai/createGhIssue.mjs` script is refactored to use `fs-extra` for all file system operations.
2.  The script's functionality remains unchanged.
3.  All `fs` and `fs/promises` imports are replaced with `fs-extra`.
