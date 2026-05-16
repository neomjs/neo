---
id: 7873
title: Standardize version reporting across MCP servers
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T10:58:47Z'
updatedAt: '2025-11-23T11:01:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7873'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T11:01:42Z'
---
# Standardize version reporting across MCP servers

Inconsistencies exist in how the `version` is reported in the HealthService of the three MCP servers (memory-core, knowledge-base, github-workflow). 

Some use hardcoded values, while others use `process.env.npm_package_version`. The GitHub Workflow server is missing the top-level version entirely in its health check response. 

This task involves:
1. Standardizing the version retrieval to use `process.env.npm_package_version || '1.0.0'` across all `HealthService` classes.
2. Updating the OpenAPI spec for the GitHub Workflow server to include the `version` field in the response schema.

## Timeline

- 2025-11-23T10:58:48Z @tobiu added the `enhancement` label
- 2025-11-23T10:58:48Z @tobiu added the `ai` label
- 2025-11-23T10:59:13Z @tobiu assigned to @tobiu
- 2025-11-23T11:01:34Z @tobiu referenced in commit `ca1220a` - "Standardize version reporting across MCP servers #7873"
- 2025-11-23T11:01:42Z @tobiu closed this issue

