---
id: 7716
title: Improve `create_issue` tool description for better user workflow
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-07T09:06:42Z'
updatedAt: '2025-11-07T09:10:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7716'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-07T09:10:43Z'
---
# Improve `create_issue` tool description for better user workflow

The `create_issue` tool in `ai/mcp/server/github-workflow/openapi.yaml` should have an improved description. The new description should instruct the agent to output the proposed `title`, `labels`, and `body` into the chat for user review *before* calling the tool. This allows the user to verify and enhance the content, improving the collaborative ticket creation process.

## Timeline

- 2025-11-07T09:06:44Z @tobiu added the `enhancement` label
- 2025-11-07T09:06:44Z @tobiu added the `developer-experience` label
- 2025-11-07T09:06:44Z @tobiu added the `ai` label
- 2025-11-07T09:10:22Z @tobiu referenced in commit `0e7c542` - "Improve create_issue tool description for better user workflow #7716"
- 2025-11-07T09:10:38Z @tobiu assigned to @tobiu
- 2025-11-07T09:10:43Z @tobiu closed this issue

