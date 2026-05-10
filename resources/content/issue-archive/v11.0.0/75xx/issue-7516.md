---
id: 7516
title: 'Bug: query_documents input parameter mismatch'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T14:07:47Z'
updatedAt: '2025-10-16T14:15:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7516'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-16T14:15:21Z'
---
# Bug: query_documents input parameter mismatch

When calling the `query_documents` tool, the MCP client receives an error: `params must NOT have additional properties`. Additionally, the `queryDocuments` service function reports that "A query string must be provided," indicating that the `query` parameter is not being correctly passed.

This bug prevents the `query_documents` tool from functioning correctly, as its input parameters are not being validated or routed as expected.

## Acceptance Criteria

1.  The `openapi.yaml` definition for the `query_documents` tool is reviewed and corrected.
2.  The `buildZodSchema` function in `toolService.mjs` is reviewed to ensure it correctly processes `requestBody` parameters for direct argument mapping.
3.  The `query` and `type` parameters are correctly passed from the MCP client to the `queryDocuments` service function.
4.  The `query_documents` tool executes successfully with valid parameters.

## Timeline

- 2025-10-16T14:07:47Z @tobiu assigned to @tobiu
- 2025-10-16T14:07:49Z @tobiu added the `bug` label
- 2025-10-16T14:07:49Z @tobiu added parent issue #7501
- 2025-10-16T14:07:49Z @tobiu added the `ai` label
- 2025-10-16T14:15:11Z @tobiu referenced in commit `819f7e0` - "Bug: query_documents input parameter mismatch #7516"
- 2025-10-16T14:15:21Z @tobiu closed this issue

