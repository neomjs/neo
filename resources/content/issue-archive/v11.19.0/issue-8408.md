---
id: 8408
title: Optimize 'sync_all' tool description to reduce redundant calls
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T07:19:02Z'
updatedAt: '2026-01-08T07:25:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8408'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T07:25:36Z'
---
# Optimize 'sync_all' tool description to reduce redundant calls

**Goal:** Optimize the usage of the `sync_all` tool by clarifying its intended purpose in the OpenAPI definition.

**Context:**
Agents currently overuse `sync_all` to "verify" tickets they just created. This is redundant because:
1.  The agent already has the ticket details in its context window.
2.  The `github-workflow` MCP server auto-syncs on startup.
3.  The user typically handles "Ticket Sync" commits separately.

**Changes Required:**
1.  Modify `ai/mcp/server/github-workflow/openapi.yaml`.
2.  Update the description for `sync_all` to explicitly discourage its use for immediate verification.
3.  Clarify that it should primarily be used for:
    *   Fetching remote changes made by others.
    *   Pushing *local* markdown edits (e.g., description updates) to GitHub.

**Why:**
To reduce unnecessary tool calls and noise in the agent's workflow.

## Timeline

- 2026-01-08T07:19:03Z @tobiu added the `documentation` label
- 2026-01-08T07:19:03Z @tobiu added the `enhancement` label
- 2026-01-08T07:19:03Z @tobiu added the `ai` label
- 2026-01-08T07:23:51Z @tobiu referenced in commit `25140d2` - "docs: Enforce 'Git Push' in AGENTS.md and optimize 'sync_all' tool description (#8407) (#8408)"
- 2026-01-08T07:24:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T07:24:26Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `ai/mcp/server/github-workflow/openapi.yaml` to clarify the usage of the `sync_all` tool. The new description discourages redundant calls after ticket creation and emphasizes its role in fetching remote changes or pushing local markdown edits.

- 2026-01-08T07:25:36Z @tobiu closed this issue

