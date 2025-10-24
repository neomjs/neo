---
id: 7625
title: Implement Tool to Assign Issues to Contributors
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T14:42:46Z'
updatedAt: '2025-10-23T15:53:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7625'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T15:53:12Z'
---
# Implement Tool to Assign Issues to Contributors

**Reported by:** @tobiu on 2025-10-23

We need the ability to assign GitHub issues to contributors via an MCP tool. This will allow for the automation of ticket assignments as part of our project management workflow.

### Proposed Solution

Create a new tool named `assign_issue`.

**Implementation:**

*   **Purpose:** Assigns a specific issue to one or more users.
*   **Underlying Command:** This tool will use the `gh issue edit <number> --add-assignee <login>` command.
*   **Parameters:** `issue_number` (integer), `assignees` (array of strings).

**Workflow Guidance:**

Assigning issues is a permission-restricted action. Before calling this tool, an agent **must** first call the generic `get_viewer_permission` tool (defined in ticket #7624) to ensure it has sufficient permissions. The required permission levels are `ADMIN`, `MAINTAIN`, or `WRITE`.

