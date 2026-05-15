---
id: 7883
title: Enhance query_documents tool with limit parameter and updated JSDoc
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T18:22:11Z'
updatedAt: '2025-11-23T18:26:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7883'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T18:26:05Z'
---
# Enhance query_documents tool with limit parameter and updated JSDoc

**Objective:**
Enhance the `query_documents` tool to allow users to specify the maximum number of results returned and improve documentation accuracy.

**Tasks:**
1.  **Add `limit` parameter:**
    *   Update `ai/mcp/server/knowledge-base/openapi.yaml` to include an optional `limit` integer property in the `QueryRequest` schema.
    *   Update `ai/mcp/server/knowledge-base/services/QueryService.mjs` to accept `limit` in the `queryDocuments` method.
    *   Use the provided `limit` (defaulting to 25) to slice the final sorted results.

2.  **Update JSDoc:**
    *   Update the JSDoc for `queryDocuments` in `ai/mcp/server/knowledge-base/services/QueryService.mjs` to explicitly list the supported values for the `type` parameter (all, blog, guide, src, example, ticket, release), matching the OpenAPI specification.


## Timeline

- 2025-11-23T18:22:28Z @tobiu assigned to @tobiu
- 2025-11-23T18:22:37Z @tobiu added the `enhancement` label
- 2025-11-23T18:22:37Z @tobiu added the `ai` label
- 2025-11-23T18:24:46Z @tobiu referenced in commit `4009089` - "Enhance query_documents tool with limit parameter and updated JSDoc #7883"
- 2025-11-23T18:26:05Z @tobiu closed this issue

