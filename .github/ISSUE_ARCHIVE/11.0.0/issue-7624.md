---
id: 7624
title: Create Generic `get_viewer_permission` Tool
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T14:41:47Z'
updatedAt: '2025-10-23T14:56:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7624'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T14:56:52Z'
---
# Create Generic `get_viewer_permission` Tool

**Reported by:** @tobiu on 2025-10-23

To safely perform restricted actions like assigning issues, merging pull requests, or adding certain labels, an agent must first know its permission level for the repository. Creating a specific permission-checking tool for each action (e.g., `can_assign_issues`, `can_merge_prs`) is not scalable.

A much better approach is to create a single, generic tool that reports the user's permission level, allowing the agent to make an informed decision about its capabilities.

### Proposed Solution

Create a new, read-only tool named `get_viewer_permission`.

**Implementation:**

1.  The tool will use a new GraphQL query to fetch the `viewerPermission` field on the `repository` object.
2.  This field returns the permission level of the user whose token is being used for the API request.

**Output:**

The tool will return a single string representing the user's permission level. The possible values are:

*   `ADMIN`: Can read, write, and manage the repository.
*   `MAINTAIN`: Can read, write, and manage issues and pull requests.
*   `WRITE`: Can read and write to the repository.
*   `TRIAGE`: Can manage issues and pull requests.
*   `READ`: Can read the repository.

**Usage:**

An agent will call this tool once to determine its capability level. It can then use this information to decide whether to proceed with restricted actions. For example, to assign an issue, the agent would first call `get_viewer_permission` and only proceed to call `assign_issue` if the returned value is `ADMIN`, `MAINTAIN`, or `WRITE`.

