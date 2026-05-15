---
id: 7609
title: 'New Tool: Get Local Issue by ID'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T12:44:30Z'
updatedAt: '2025-10-22T12:53:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7609'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T12:53:25Z'
---
# New Tool: Get Local Issue by ID

To improve an agent's ability to quickly access context, we need a new tool, `get_local_issue_by_id`, that can retrieve a local issue's markdown file directly by its number.

This tool will provide a direct lookup mechanism, bypassing the need to manually browse the file system or parse the output of other tools. It should be intelligent enough to find the issue whether it is in the active `ISSUES` directory or recursively within the `ISSUE_ARCHIVE` directory.

## Acceptance Criteria

1.  A new service, `LocalFileService.mjs`, is created within the `github-workflow` server to handle local file system lookups.
2.  A method `getIssueById(issueNumber)` is implemented in the new service.
3.  The method accepts an issue number as a string (e.g., `"7608"` or `"#7608"`).
4.  The method uses configuration (`issueFilenamePrefix`, `issuesDir`, `archiveDir`) to locate the file.
5.  If the file is found, the service returns a JSON object containing both the absolute `filePath` and the file's `content`.
6.  If the file is not found, a structured `404 Not Found` error is returned.
7.  A new endpoint, `GET /issues/{issue_number}/content`, is added to `openapi.yaml` with the `operationId: get_local_issue_by_id`.
8.  A new schema, `LocalIssueResponse`, is added to `openapi.yaml` to define the successful response object (`filePath`, `content`). The endpoint's `200` response must use this schema with an `application/json` content type.
9.  The new tool is registered in the `github-workflow/services/toolService.mjs`.

## Timeline

- 2025-10-22T12:44:30Z @tobiu assigned to @tobiu
- 2025-10-22T12:44:32Z @tobiu added the `enhancement` label
- 2025-10-22T12:44:32Z @tobiu added the `ai` label
- 2025-10-22T12:53:11Z @tobiu referenced in commit `ba7c596` - "New Tool: Get Local Issue by ID #7609"
- 2025-10-22T12:53:25Z @tobiu closed this issue

