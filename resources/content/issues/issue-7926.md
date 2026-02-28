---
id: 7926
title: 'Feat: Add Cross-Repo Capabilities to GitHub Workflow MCP'
state: OPEN
labels:
  - enhancement
  - stale
  - ai
assignees: []
createdAt: '2025-11-29T15:20:12Z'
updatedAt: '2026-02-28T03:22:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7926'
author: tobiu
commentsCount: 1
parentIssue: 7914
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Add Cross-Repo Capabilities to GitHub Workflow MCP

# Feat: Add Cross-Repo Capabilities to GitHub Workflow MCP

## Context
For the "Connected Organization" (Phase 1), agents need to manage tickets in repositories other than the one they are running in.

## Requirements
1.  **Tool Enhancement:** Update `create_issue`, `list_issues`, etc., to accept an optional `repository` argument (format: `owner/repo`).
2.  **Context Awareness:** If no repository is provided, default to the current context.
3.  **Safety:** Ensure permissions are checked before attempting cross-repo actions.

## Output
*   Updated `GitHubWorkflow` tools supporting cross-repo operations.


## Timeline

- 2025-11-29T15:20:12Z @tobiu added the `enhancement` label
- 2025-11-29T15:20:13Z @tobiu added the `ai` label
- 2025-11-29T15:22:26Z @tobiu added parent issue #7914
### @github-actions - 2026-02-28T03:22:03Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-02-28T03:22:04Z @github-actions added the `stale` label

