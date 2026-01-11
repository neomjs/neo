---
id: 7752
title: Add `update_comment` Tool to GitHub Workflow Server
state: CLOSED
labels:
  - enhancement
  - good first issue
  - ai
assignees: []
createdAt: '2025-11-12T08:21:09Z'
updatedAt: '2025-11-12T14:31:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7752'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-12T14:31:45Z'
---
# Add `update_comment` Tool to GitHub Workflow Server

During a recent PR review (PR #7741), the agent posted a comment that contained an error. The only way to correct this was for the user to manually edit the comment. There is currently no tool to programmatically edit or update existing comments.

This ticket proposes creating a new `update_comment` tool to fill this gap, allowing for more robust and self-correcting agent behavior.

**Acceptance Criteria:**
1.  A new tool, `update_comment`, is added to the GitHub Workflow MCP server.
2.  The tool must accept a `comment_id` and a new `body` as parameters.
3.  The tool should be added to `openapi.yaml` with clear documentation.
4.  A corresponding service method should be implemented, likely within `PullRequestService.mjs`.
5.  The new tool must be registered in `toolService.mjs`.

## Timeline

- 2025-11-12T08:21:11Z @tobiu added the `enhancement` label
- 2025-11-12T08:21:11Z @tobiu added the `good first issue` label
- 2025-11-12T08:21:11Z @tobiu added the `ai` label
- 2025-11-12T10:38:32Z @MannXo cross-referenced by PR #7755
- 2025-11-12T14:31:46Z @tobiu closed this issue

