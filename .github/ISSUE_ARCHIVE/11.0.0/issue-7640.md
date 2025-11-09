---
id: 7640
title: 'Feat: Add agent identity and templating to `createComment` tool'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T09:38:03Z'
updatedAt: '2025-10-25T09:50:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7640'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T09:50:17Z'
---
# Feat: Add agent identity and templating to `createComment` tool

**Reported by:** @tobiu on 2025-10-25

To standardize AI-generated comments on pull requests and reduce formatting errors, the `createComment` tool will be enhanced.

**Changes:**
1.  **New `agent` Parameter:** A new `agent` parameter will be added to the `createComment` tool. The description for this parameter will be clear that it's for identifying the agent model (e.g., "Gemini 2.5 pro").
2.  **Server-Side Templating:** The `createComment` method in `PullRequestService.mjs` will be updated. It will use the `agent` parameter to wrap the provided `body` in a template that adds a header (`Input from [agent]:`) and prefixes the comment body with a specific icon (`✦` for Gemini, `❋` for Claude).
3.  **API Spec Update:** The `openapi.yaml` file for the `github-workflow` server will be updated to include the new `agent` parameter in the `createComment` operation and clarify that the tool now handles the comment formatting.

