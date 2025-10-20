---
title: "Externalize Magic Numbers and Strings in SyncService"
labels: enhancement, AI
---

GH ticket id: #7582

**Epic:** #7564
**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

The `SyncService` implementation contains several hardcoded "magic numbers" and strings (e.g., API limits, buffer sizes, Markdown delimiters). To improve maintainability and make the service more configurable, these should be extracted and moved to the central `config.mjs` file.

## Acceptance Criteria

1.  The following properties are added to the `githubWorkflow.issueSync` object in `config.mjs`:
    - `maxGhOutputBuffer` (e.g., `10 * 1024 * 1024`)
    - `maxIssues` (e.g., `10000`)
    - `maxReleases` (e.g., `1000`)
    - `commentSectionDelimiter` (e.g., `'## Comments'`)
2.  The `SyncService.mjs` file is refactored to import and use these new configuration values instead of the hardcoded numbers and strings.
