---
id: 7756
title: Enhance `create_comment` tool to enforce reading related tickets
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - Mahita07
createdAt: '2025-11-12T14:12:09Z'
updatedAt: '2025-11-14T09:15:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7756'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhance `create_comment` tool to enforce reading related tickets

To improve the quality of pull request reviews, agents should be required to read the associated ticket before commenting. This ensures that the review is based on the full context and requirements of the changes.

**Acceptance Criteria:**
1.  Update the description of the `create_comment` tool in `ai/mcp/server/github-workflow/openapi.yaml`.
2.  The new description should explicitly state that the agent must read the related ticket(s) before creating a review comment.
3.  The description should guide the agent to look for linked issues in the PR body.

## Timeline

- 2025-11-12T14:12:11Z @tobiu added the `enhancement` label
- 2025-11-12T14:12:11Z @tobiu added the `ai` label
### @Mahita07 - 2025-11-14T06:28:13Z

@tobiu could you please assign this ticket to me ?

### @tobiu - 2025-11-14T09:15:07Z

Yes, I can. This ticket is trivial (just adding a comment) into the yaml file, but it might be a good starting point to try out how the 3 MCP servers have evolved. Make sure to update your fork first, and in case you have not done it already, I recommend to read the v11 blog post.

- 2025-11-14T09:15:12Z @tobiu assigned to @Mahita07

