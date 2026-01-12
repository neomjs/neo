---
id: 7884
title: Enforce "Propose-First" workflow and Labeling in create_issue tool description
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T18:28:44Z'
updatedAt: '2025-11-23T18:49:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7884'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T18:49:25Z'
---
# Enforce "Propose-First" workflow and Labeling in create_issue tool description

The `create_issue` tool description in the GitHub Workflow MCP server is currently being overlooked regarding the pre-call proposal step and mandatory labeling.

This task involves updating `ai/mcp/server/github-workflow/openapi.yaml` to drastically strengthen the language in the `create_issue` tool description.

**Required Changes:**
1.  **Strict Enforcement:** Add explicit "CRITICAL PROTOCOL" warnings.
2.  **Visual Proposal:** Mandate that the agent *must* output the `title`, `body`, and `labels` in a code block or clear format *before* invoking the tool.
3.  **Labeling:** Reiterate the mandatory `ai` label and the requirement to check `list_labels` first.

**Goal:** Ensure the agent never creates an issue without the user seeing exactly what will be created first.

## Timeline

- 2025-11-23T18:28:45Z @tobiu added the `documentation` label
- 2025-11-23T18:28:46Z @tobiu added the `enhancement` label
- 2025-11-23T18:28:46Z @tobiu added the `ai` label
- 2025-11-23T18:29:00Z @tobiu assigned to @tobiu
- 2025-11-23T18:49:18Z @tobiu referenced in commit `7d40fdc` - "Enforce "Propose-First" workflow and Labeling in create_issue tool description #7884"
- 2025-11-23T18:49:25Z @tobiu closed this issue

