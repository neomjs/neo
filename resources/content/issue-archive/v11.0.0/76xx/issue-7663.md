---
id: 7663
title: 'Feat: Implement GitHub API-based ''list_issues'' Tool'
state: CLOSED
labels:
  - enhancement
  - hacktoberfest
  - ai
assignees:
  - MannXo
createdAt: '2025-10-26T12:11:26Z'
updatedAt: '2025-11-01T18:22:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7663'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-01T18:22:03Z'
---
# Feat: Implement GitHub API-based 'list_issues' Tool

This ticket is a feature request to implement a new tool in the `github-workflow` MCP server.

**Motivation:**
The `pr-workflow.md` guide (which is now largely obsolete) contained instructions for using `gh issue list`. Currently, there is no corresponding GitHub API-based tool to list issues from the repository. The existing `get_local_issue_by_id` tool only allows for local lookup. Implementing a `list_issues` tool would provide a complete set of GitHub interaction tools for agents.

**Implementation Details:**
*   **GraphQL Query:** The `FETCH_ISSUES_FOR_SYNC` GraphQL query (located in `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs`) is already comprehensive and can likely be re-used as the basis for this new tool.
*   **Service Method:** A new method will need to be added to an appropriate service (e.g., `IssueService.mjs`) to encapsulate the logic for calling the GraphQL API and processing the results.
*   **Tool Registration:** The new tool (`list_issues`) must be registered in `ai/mcp/server/github-workflow/services/toolService.mjs`, mapping it to the newly created service method.
*   **OpenAPI Specification:** A complete and accurate definition for the `list_issues` tool, including its input parameters and output shape, must be added to `github-workflow/openapi.yaml`. **Tiny spec errors can break tools completely, so precision is crucial.**

**Functionality:**
The new `list_issues` tool should provide a way to query GitHub's API to retrieve a list of issues, similar to how `list_pull_requests` works for pull requests.

**Parameters:**
Consider parameters such as `limit`, `state` (e.g., `open`, `closed`, `all`), and potentially `labels` or `assignee` for filtering.

**Documentation:**
The tool's description in `openapi.yaml` should be comprehensive and self-explanatory, following the guidelines established in #7659.

## Timeline

- 2025-10-26T12:11:27Z @tobiu added the `enhancement` label
- 2025-10-26T12:11:27Z @tobiu added the `ai` label
### @MannXo - 2025-10-27T12:27:37Z

Can I work on this one @tobiu ?

### @tobiu - 2025-10-27T12:56:25Z

@MannXo Sure. This one should be quite straight forward. Hint: all 3 MCP servers should now be fully functional, and I updated the AGENTS.md file => with a fresh/updated fork definitely worth some testing.

- 2025-10-27T12:56:31Z @tobiu assigned to @MannXo
- 2025-10-27T12:56:38Z @tobiu added the `hacktoberfest` label
- 2025-10-28T09:24:13Z @MannXo referenced in commit `7f720ed` - "feat(mcp/github-workflow): add list_issues tool, OpenAPI path/schemas and verification tests

Closes: #7663 - Feat: Implement GitHub API-based 'list_issues' tool

Includes:
- IssueService.listIssues implementation
- Registered list_issues in toolService
- OpenAPI: GET /issues + IssueListResponse schema
- lightweight file-based verification tests
- HealthService robustness fix for gh stdout/stderr"
- 2025-10-28T09:31:03Z @MannXo cross-referenced by PR #7678
- 2025-11-01T18:22:03Z @tobiu closed this issue
- 2025-11-01T18:22:03Z @tobiu referenced in commit `be4f244` - "feat(mcp/github-workflow): add list_issues tool, OpenAPI path/schemas and verification tests

Closes: #7663 - Feat: Implement GitHub API-based 'list_issues' tool

Includes:
- IssueService.listIssues implementation
- Registered list_issues in toolService
- OpenAPI: GET /issues + IssueListResponse schema
- lightweight file-based verification tests
- HealthService robustness fix for gh stdout/stderr"

