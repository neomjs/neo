---
id: 7858
title: 'Documentation: Comprehensive Guide for GitHub Workflow MCP Server'
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-22T15:42:28Z'
updatedAt: '2025-11-22T15:42:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7858'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Documentation: Comprehensive Guide for GitHub Workflow MCP Server

Enhance `learn/guides/mcp/GitHubWorkflow.md` to provide a deep dive into the `neo.mjs-github-workflow` MCP server.

**Requirements:**
- **Document all available tools:** based on `openapi.yaml` (e.g., `healthcheck`, `sync_all`, `create_issue`, `update_issue_relationship`, etc.).
- **Explain the internal architecture:** Detail the service layer and synchronization logic.
- **Deep Dive into SyncService:** Explain the orchestration of `IssueSyncer`, `ReleaseSyncer`, and `MetadataManager`.
- **GraphQL Integration:** Describe how `GraphqlService` is used for complex data fetching and mutations.
- **Update Core Sections:** Revise "Purpose" and "Workflow" to accurately reflect the current code implementation.

**Source Files to Analyze:**
- `ai/mcp/server/github-workflow/openapi.yaml`
- `ai/mcp/server/github-workflow/services/SyncService.mjs`
- `ai/mcp/server/github-workflow/services/sync/*.mjs`
- `ai/mcp/server/github-workflow/services/*.mjs`


## Activity Log

- 2025-11-22 @tobiu added the `documentation` label
- 2025-11-22 @tobiu added the `enhancement` label
- 2025-11-22 @tobiu added the `ai` label

