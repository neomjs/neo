---
id: 7888
title: Standardize MCP Tool Method Signatures with Default Objects
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-24T08:28:19Z'
updatedAt: '2025-11-24T08:49:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7888'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-24T08:49:32Z'
---
# Standardize MCP Tool Method Signatures with Default Objects

Refactor all MCP server service methods mapped to tools to ensure consistent and robust handling of optional object arguments.

**Objective:**
Establish a strict standard for method signatures based on argument requirements:

1.  **Required Arguments:**
    -   **Pattern:** `async method({arg1})`
    -   **Behavior:** Do NOT provide a default object value. This ensures the call fails fast with a clear error if the required argument object is missing.

2.  **Optional Arguments:**
    -   **Pattern:** `async method({opt1} = {})`
    -   **Behavior:** MUST provide a default empty object. This allows the tool to be called without passing any arguments (e.g., `list_summaries()`) without throwing a destructuring error.

**Scope:**
- `ai/mcp/server/memory-core`
- `ai/mcp/server/knowledge-base`
- `ai/mcp/server/github-workflow`

**Tasks:**
1.  Audit all service methods mapped in `toolService.mjs` for each server.
2.  Identify methods where all arguments are optional or where the method signature implies it can be called without arguments.
3.  Update the method signatures to include `= {}` where appropriate.
4.  Ensure methods with required arguments do *not* have `= {}`.

**Specific Candidates Identified (Non-exhaustive):**
- `SummaryService.listSummaries` (Memory Core) - `limit` and `offset` have defaults.
- `SessionService.summarizeSessions` (Memory Core) - `includeAll` and `sessionId` are optional.
- `DocumentService.listDocuments` (Knowledge Base) - `limit` and `offset` likely have defaults.
- `PullRequestService.listPullRequests` (GitHub) - `limit` and `state` likely have defaults.
- `IssueService.listIssues` (GitHub) - arguments likely optional.
- `LabelService.listLabels` (GitHub) - likely takes no args or optional args.
- `SyncService.runFullSync` (GitHub) - likely no args.
- `HealthService.healthcheck` (All) - likely no args.
- `DatabaseService.exportDatabase` (Memory Core) - `include` has default.
- `RepositoryService.getViewerPermission` (GitHub) - likely no args.

**Note:**
This refactoring ensures that calling a tool like `list_summaries` via MCP without passing an empty object `{}` (which some clients might do) will not cause a server-side error.

## Timeline

- 2025-11-24T08:28:21Z @tobiu added the `enhancement` label
- 2025-11-24T08:28:21Z @tobiu added the `ai` label
- 2025-11-24T08:28:21Z @tobiu added the `refactoring` label
- 2025-11-24T08:48:08Z @tobiu assigned to @tobiu
- 2025-11-24T08:49:20Z @tobiu referenced in commit `a370f39` - "Standardize MCP Tool Method Signatures with Default Objects #7888"
- 2025-11-24T08:49:32Z @tobiu closed this issue

