---
title: "Refactor SyncService to Use Centralized Configuration"
labels: enhancement, AI
---

GH ticket id: #7569

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

The `SyncService` currently contains several hardcoded constants and static configuration values (e.g., file paths, dropped labels, release schedules). To improve maintainability and flexibility, these values should be moved to the central MCP server configuration file at `ai/mcp/server/config.mjs`.

This ticket covers updating the configuration file and refactoring the `SyncService` to consume these external values.

## Acceptance Criteria

1.  The `ai/mcp/server/config.mjs` file is updated with a new `githubWorkflow.issueSync` object.
2.  This new object contains all configurable aspects of the sync process:
    - `issuesDir` (absolute path)
    - `archiveDir` (absolute path)
    - `metadataFile` (absolute path)
    - `droppedLabels` (array of strings)
    - `releases` (array of objects)
3.  The `SyncService.mjs` file is refactored to:
    - Import the `aiConfig` from `ai/mcp/server/config.mjs`.
    - Remove the hardcoded path constants (`metadataPath`, `issuesDir`, `archiveDir`).
    - Remove the static `config` properties (`droppedLabels`, `releases`).
    - All methods within the service are updated to reference the values from the imported `aiConfig.githubWorkflow.issueSync` object instead of local constants or static properties.

## Benefits

-   **Centralized Configuration:** All server settings are in one predictable location.
-   **Improved Maintainability:** Business logic (like the release schedule) can be updated without changing the service's code.
-   **Increased Flexibility:** The local file structure can be easily reconfigured for different projects or testing scenarios.
-   **Cleaner Code:** Removes hardcoded values from the service, making the logic itself clearer.
