---
id: 9566
title: Enhance `agent` parameter formatting in GitHub Workflow MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T09:14:14Z'
updatedAt: '2026-03-27T09:14:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9566'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T09:14:57Z'
---
# Enhance `agent` parameter formatting in GitHub Workflow MCP Server

### Problem
The `agent` parameter in the `manage_issue_comment` tool (within `github-workflow/openapi.yaml`) currently specifies the agent wrapper (e.g., "Antigravity") but does not capture the underlying AI model. This makes it difficult to differentiate which model generated a specific comment (e.g. Gemini vs Claude).

### Proposed Solution
Update the `openapi.yaml` description and examples for the `agent` parameter to enforce a format that includes both the model and the wrapper.

Preferred format: `[Model Name] ([Agent Wrapper])`
Examples:
- `Gemini 3.1 Pro (Antigravity)`
- `Claude Opus 4.6 (Antigravity)`
- `Gemini 3.1 Pro (Gemini CLI)`

## Timeline

- 2026-03-27T09:14:15Z @tobiu added the `enhancement` label
- 2026-03-27T09:14:15Z @tobiu added the `ai` label
- 2026-03-27T09:14:42Z @tobiu referenced in commit `1a3a8c3` - "docs: Enhance agent parameter format to include model identity (#9566)"
- 2026-03-27T09:14:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-27T09:14:57Z

**Input from Antigravity:**

> ◆ I have completed the implementation for this enhancement.
> 
> **Summary of Changes:**
> 1. Updated `github-workflow/openapi.yaml` to explicitly state the format for the `agent` parameter as `[Model Name] ([Agent Wrapper])`.
> 2. Changed the example value to `"Gemini 3.1 Pro (Antigravity)"`.
> 
> The changes have been pushed to the remote repository and the issue is now complete.

- 2026-03-27T09:14:58Z @tobiu closed this issue

