---
id: 9800
title: '[MCP] GitHub Workflow: Autonomous Swarm Synchronization & Post-Sync Auto-Push'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T23:16:55Z'
updatedAt: '2026-04-08T23:17:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9800'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T23:17:16Z'
---
# [MCP] GitHub Workflow: Autonomous Swarm Synchronization & Post-Sync Auto-Push

## The Problem
The autonomous agent swarm requires a reliable transport mechanism to sync episodic memory across distributed hardware nodes (e.g., Mac 1 and Mac 2). Without a shared raw SQLite database, the agent instances suffer from "Boot Amnesia." While we have an hourly CI pipeline that syncs GitHub issues to the local filesystem for knowledge retrieval, the AI agents themselves could not push their newly generated context back to the remote repository. 

## The Architectural Reality
We implemented a robust auto-commit and push mechanism directly within the GitHub Workflow MCP server to handle remote syncing.
*   **Target Path:** `ai/mcp/server/github-workflow/services/SyncService.mjs`
*   **Mechanism:** Inside `runFullSync()`, we check the Git status for the `resources/content` directory. 
*   **Metadata Filtering:** If only `.sync-metadata.json` changed, we automatically roll it back (`git restore`) to prevent pointless, noisy commits.
*   **Push & Merge Strategy:** For actual content changes, it uses `git pull --rebase --autostash` before pushing to handle potential conflicts with the hourly CI node or other swarm instances without detached HEAD states.
*   **Security Configuration:** Integrated with dynamic viewer permission gating (`RepositoryService.getViewerPermission()`) to ensure the agent has `WRITE`, `MAINTAIN`, or `ADMIN` roles before auto-pushing. Added configuration toggles (`pushToRepoAfterSync`) in `config.template.mjs` and `config.mjs`.

## Avoided "Gold Standards" / Traps
* **Avoided Standard Stash/Pop:** Standard Git workflows often suggest `git stash` followed by a `git stash pop`. In an autonomous, stateless background daemon, resolving merge conflicts from popped stashes is a death trap. Instead, `--rebase --autostash` ensures clean history and atomic re-application, avoiding interactive prompt deadlocks.
* **Avoided Blind Pushes:** Pushing blindly without explicit permission checks leads to unhandled permission-denied crashes. By integrating GraphQL permission scoping, the MCP server guarantees safety up front.

## Timeline

- 2026-04-08T23:16:58Z @tobiu added the `enhancement` label
- 2026-04-08T23:16:58Z @tobiu added the `ai` label
- 2026-04-08T23:17:04Z @tobiu referenced in commit `055e464` - "feat: Add post-sync auto-push to MCP GitHub Workflow (#9800)"
- 2026-04-08T23:17:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T23:17:15Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Implementation pushed and verified. The `SyncService` now automatically commits and pushes episodic memory data using `--rebase --autostash` to prevent staging deadlocks. The ticket is ready to close.

- 2026-04-08T23:17:16Z @tobiu closed this issue

