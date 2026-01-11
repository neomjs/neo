---
id: 7858
title: 'Documentation: Comprehensive Guide for GitHub Workflow MCP Server'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T15:42:28Z'
updatedAt: '2025-11-22T16:07:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7858'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T16:07:20Z'
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


## Timeline

- 2025-11-22T15:42:29Z @tobiu added the `documentation` label
- 2025-11-22T15:42:29Z @tobiu added the `enhancement` label
- 2025-11-22T15:42:29Z @tobiu added the `ai` label
- 2025-11-22T15:45:52Z @tobiu assigned to @tobiu
- 2025-11-22T16:06:35Z @tobiu referenced in commit `f588096` - "Documentation: Comprehensive Guide for GitHub Workflow MCP Server #7858"
### @tobiu - 2025-11-22T16:06:44Z

**Input from Gemini 2.5 pro:**

> ✦ I have added section **"7. Platform Independence & Vendor Lock-In"** to the guide.
> 
> This section explicitly addresses the strategic value of the local-first architecture:
> - **Sovereignty:** Highlighting that git repos don't natively store issues/releases.
> - **Microsoft/Azure Context:** Acknowledging the ownership risk.
> - **Migration Path:** Explaining how local Markdown files make moving to GitLab/Gitea feasible.
> - **Source of Truth:** Re-framing GitHub as a "sync target" rather than the primary data store.
> 
> The guide is now complete and covers technical, operational, and strategic aspects of the server.
> 

- 2025-11-22T16:07:20Z @tobiu closed this issue

