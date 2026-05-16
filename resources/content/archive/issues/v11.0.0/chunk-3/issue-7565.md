---
id: 7565
title: Create Scaffold for the Issue Synchronization Service
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T11:19:58Z'
updatedAt: '2025-10-20T11:38:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7565'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-20T11:38:36Z'
---
# Create Scaffold for the Issue Synchronization Service

This ticket covers the initial setup and scaffolding for the new `SyncService`, which will be the heart of the bi-directional issue synchronization mechanism. This involves creating the service class itself, exposing it as a new tool, and defining the structure for its state management.

## Acceptance Criteria

1.  A new file, `ai/mcp/server/github-workflow/services/SyncService.mjs`, is created.
2.  The file defines a new class, `SyncService`, that extends `Neo.core.Base` and is configured as a `singleton`.
3.  A placeholder method, `runFullSync()`, is created within the `SyncService`.
4.  The `openapi.yaml` for the `github-workflow` server is updated to include a new `sync_issues` tool that calls this service.
5.  The `serviceMapping` in `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to map the `sync_issues` operationId to `SyncService.runFullSync`.
6.  The `SyncService` includes `#loadMetadata()` and `#saveMetadata()` methods that read from and write to a new `.github/.sync-metadata.json` file. The initial structure of this JSON file should be defined (e.g., `{ "last_sync": null, "issues": {} }`).

## Benefits

-   Establishes the core architectural component for the sync process.
-   Creates the necessary API endpoint for agents to trigger the synchronization.
-   Provides the foundation for stateful, delta-based updates.

## Timeline

- 2025-10-20T11:19:58Z @tobiu assigned to @tobiu
- 2025-10-20T11:19:59Z @tobiu added the `enhancement` label
- 2025-10-20T11:20:00Z @tobiu added the `ai` label
- 2025-10-20T11:20:00Z @tobiu added parent issue #7564
- 2025-10-20T11:38:27Z @tobiu referenced in commit `d58e368` - "Create Scaffold for the Issue Synchronization Service #7565"
- 2025-10-20T11:38:36Z @tobiu closed this issue

