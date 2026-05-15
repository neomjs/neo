---
id: 7569
title: Refactor SyncService to Use Centralized Configuration
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:04:43Z'
updatedAt: '2025-10-20T12:08:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7569'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-20T12:08:40Z'
---
# Refactor SyncService to Use Centralized Configuration

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

## Timeline

- 2025-10-20T12:04:43Z @tobiu assigned to @tobiu
- 2025-10-20T12:04:45Z @tobiu added parent issue #7564
- 2025-10-20T12:04:45Z @tobiu added the `enhancement` label
- 2025-10-20T12:04:45Z @tobiu added the `ai` label
- 2025-10-20T12:08:31Z @tobiu referenced in commit `cac84a1` - "Refactor SyncService to Use Centralized Configuration #7569"
- 2025-10-20T12:08:40Z @tobiu closed this issue
- 2025-10-20T12:24:23Z @tobiu referenced in commit `c7c3223` - "Refactor SyncService to Use Centralized Configuration #7569"

