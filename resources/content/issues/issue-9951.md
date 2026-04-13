---
id: 9951
title: Scaffold signal_state_transition MCP Endpoint
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:30Z'
updatedAt: '2026-04-13T09:32:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9951'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Scaffold signal_state_transition MCP Endpoint

### Goal
Provide a native state-trap for Headless Orchestration to gracefully capture the "PR Opened" state without abstracting away native Git CLI access.

### Implementation Checklist
- [ ] Enhance the `neo-mjs-github-workflow` MCP server with a `signal_state_transition(state, target)` tool.
- [ ] Refactor Agent system prompts to instruct the model to execute this tool immediately *after* concluding its raw `gh pr create` workflow.
- [ ] Ensure the orchestration gracefully traps `PR_OPENED` to trigger the shutdown or handoff sequence autonomously.

## Timeline

- 2026-04-13T09:28:33Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:33Z @tobiu added the `ai` label
- 2026-04-13T09:28:33Z @tobiu added the `architecture` label
- 2026-04-13T09:28:47Z @tobiu added parent issue #9950
- 2026-04-13T09:32:32Z @tobiu changed title from **Scaffold submit_work MCP Meta-Tool** to **Scaffold signal_state_transition MCP Endpoint**

