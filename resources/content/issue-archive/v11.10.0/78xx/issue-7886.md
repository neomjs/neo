---
id: 7886
title: '[AI] Streamline create_issue workflow instruction'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T19:29:53Z'
updatedAt: '2025-11-23T19:30:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7886'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T19:30:41Z'
---
# [AI] Streamline create_issue workflow instruction

## Description
Updates the `create_issue` tool description in `ai/mcp/server/github-workflow/openapi.yaml` to streamline the proposal workflow.

## Changes
- Modified step 4 of the Mandatory Workflow for `create_issue`.
- **Old:** "Only *after* displaying the proposal, call `create_issue`."
- **New:** "Immediately call `create_issue` after displaying the proposal. Do not ask for permission first (the user can decline the tool call)."

## Reason
To improve workflow efficiency. Agents should display the proposal and then immediately trigger the tool, relying on the native tool confirmation UI for user approval/rejection, rather than adding an extra conversational turn to ask for permission.

## Acceptance Criteria
- The `openapi.yaml` file reflects the updated instruction.
- Future agent sessions follow the "Show -> Call" pattern without redundant permission questions.

## Timeline

- 2025-11-23T19:29:54Z @tobiu added the `documentation` label
- 2025-11-23T19:29:54Z @tobiu added the `enhancement` label
- 2025-11-23T19:29:54Z @tobiu added the `ai` label
- 2025-11-23T19:30:19Z @tobiu assigned to @tobiu
- 2025-11-23T19:30:36Z @tobiu referenced in commit `4cb4534` - "[AI] Streamline create_issue workflow instruction #7886"
- 2025-11-23T19:30:41Z @tobiu closed this issue

