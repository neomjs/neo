---
id: 7628
title: Enhance `create_issue` Tool to Support Assignees
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T15:56:27Z'
updatedAt: '2025-10-23T16:01:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7628'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T16:01:57Z'
---
# Enhance `create_issue` Tool to Support Assignees

**Reported by:** @tobiu on 2025-10-23

The `create_issue` tool is functional but could be more powerful if it allowed for assigning users at the moment of creation. The underlying `gh issue create` command already supports this via the `--assignee` flag.

This ticket proposes enhancing the existing `create_issue` tool to support an optional `assignees` parameter.

### Proposed Solution

1.  **Update OpenAPI Spec:**
    *   In `ai/mcp/server/github-workflow/openapi.yaml`, modify the request body schema for the `create_issue` operation.
    *   Add a new optional property: `assignees` (array of strings).

2.  **Update `IssueService.mjs`:**
    *   Modify the `createIssue` method to accept the new `assignees` parameter from its options object.
    *   **Add a permission check:** If the `assignees` array is provided and is not empty, the method **must** first check the cached `RepositoryService.viewerPermission`.
    *   If the user's permission level is not one of the `writePermissions` (`ADMIN`, `MAINTAIN`, `WRITE`), the tool must return a `403 Forbidden` error, similar to the `assign_issue` tool.
    *   If the permission check passes, the method should add the appropriate `--assignee` flags to the `gh` command arguments.
    *   If no `assignees` are provided, the tool should function as it currently does.

### Acceptance Criteria

-   The `create_issue` tool now accepts an optional `assignees` array.
-   Providing assignees without sufficient permissions results in a clear error message and does not create the issue.
-   Providing assignees with sufficient permissions creates the issue and assigns the specified users correctly.

