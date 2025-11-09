---
id: 7629
title: Implement `unassign_issue` Tool to Remove Specific Contributors
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T16:07:29Z'
updatedAt: '2025-10-23T16:20:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7629'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T16:20:13Z'
---
# Implement `unassign_issue` Tool to Remove Specific Contributors

**Reported by:** @tobiu on 2025-10-23

Currently, we can add assignees or clear *all* assignees from an issue. However, we lack the functionality to remove one or more specific contributors while leaving others assigned. This is a necessary feature for complete assignee management.

### Proposed Solution

Create a new tool named `unassign_issue` that removes a specified list of assignees from an issue.

**1. Update OpenAPI Spec:**

*   In `ai/mcp/server/github-workflow/openapi.yaml`, add a `delete` operation to the `/issues/{issue_number}/assignees` path.
*   The `operationId` will be `unassign_issue`.
*   The request body will take an `assignees` array (the logins to remove).

**2. Update `IssueService.mjs`:**

*   Create a new `unassignIssue` method.
*   This method **must** perform the same permission check as the `assignIssue` tool, verifying the user has `ADMIN`, `MAINTAIN`, or `WRITE` permissions by checking `RepositoryService.viewerPermission`.
*   If the check passes, the method will use the `gh issue edit <number> --remove-assignee <login>` command to remove the specified users.

**3. Update `toolService.mjs`:**

*   Add `unassign_issue` to the `serviceMapping` to expose the new method as a tool.

