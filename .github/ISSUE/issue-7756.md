---
id: 7756
title: Enhance `create_comment` tool to enforce reading related tickets
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-12T14:12:09Z'
updatedAt: '2025-11-12T14:12:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7756'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Enhance `create_comment` tool to enforce reading related tickets

**Reported by:** @tobiu on 2025-11-12

To improve the quality of pull request reviews, agents should be required to read the associated ticket before commenting. This ensures that the review is based on the full context and requirements of the changes.

**Acceptance Criteria:**
1.  Update the description of the `create_comment` tool in `ai/mcp/server/github-workflow/openapi.yaml`.
2.  The new description should explicitly state that the agent must read the related ticket(s) before creating a review comment.
3.  The description should guide the agent to look for linked issues in the PR body.

