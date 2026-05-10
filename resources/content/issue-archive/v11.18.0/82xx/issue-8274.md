---
id: 8274
title: '[Neural Link] Parameterize inspectStore limit and offset'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T17:58:25Z'
updatedAt: '2026-01-01T18:09:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8274'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T18:09:56Z'
---
# [Neural Link] Parameterize inspectStore limit and offset

The current `inspectStore` implementation hardcodes the record limit to 50 and start index to 0.
This needs to be flexible to allow paging through large stores.

Requirements:
1. Update `src/ai/client/DataService.mjs` to accept `offset` (default 0) and `limit` (default 50).
2. Update `ai/mcp/server/neural-link/services/DataService.mjs` to pass these parameters.
3. Update `ai/mcp/server/neural-link/openapi.yaml` to define these parameters in the schema.

## Timeline

- 2026-01-01T17:58:26Z @tobiu added the `enhancement` label
- 2026-01-01T17:58:26Z @tobiu added the `ai` label
- 2026-01-01T17:58:34Z @tobiu added parent issue #8169
- 2026-01-01T17:58:46Z @tobiu assigned to @tobiu
- 2026-01-01T18:09:56Z @tobiu closed this issue
- 2026-01-04T03:10:28Z @jonnyamsp referenced in commit `e389924` - "feat(ai): Parameterize inspectStore limit and offset

- Update ai.client.DataService.inspectStore to accept limit/offset and use getRange
- Update MCP DataService wrapper to pass parameters
- Update OpenAPI schema for InspectStoreRequest

Closes #8274"

