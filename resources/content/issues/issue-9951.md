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
updatedAt: '2026-04-13T09:38:54Z'
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
Provide a native state-trap for Headless Orchestration to gracefully capture the "PR Opened" state without abstracting away native Git CLI access. Additionally, provide a native mechanism for agents to signal insurmountable logic failures natively back to the framework.

### Implementation Checklist
- [ ] Enhance the `neo-mjs-github-workflow` MCP server with a `signal_state_transition(state, target)` tool.
- [ ] Support `state: 'PR_OPENED'` to trigger autonomous turn-completion and shutdown sequences.
- [ ] Support `state: 'BLOCKED'` and `state: 'HANDOFF'` for derailed agents, enabling them to pass a localized artifact mapping the problem back to the Orchestrator, which natively applies the `agent-task:blocked` label on GitHub.

## Timeline

- 2026-04-13T09:28:33Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:33Z @tobiu added the `ai` label
- 2026-04-13T09:28:33Z @tobiu added the `architecture` label
- 2026-04-13T09:28:47Z @tobiu added parent issue #9950
- 2026-04-13T09:32:32Z @tobiu changed title from **Scaffold submit_work MCP Meta-Tool** to **Scaffold signal_state_transition MCP Endpoint**

