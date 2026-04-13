---
id: 9950
title: 'Epic: Abstracting the Operating Environment (Agent OS v3)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:28Z'
updatedAt: '2026-04-13T09:32:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9950'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 9951 Scaffold signal_state_transition MCP Endpoint'
  - '[ ] 9952 Sandman Handoff: Top 10 Actionable Tasks Dashboarding'
  - '[ ] 9953 MCP Progressive Disclosure Endpoint'
  - '[x] 9957 Scaffold pull-request Progressive Disclosure Skill'
  - '[ ] 9958 System Prompt Token Optimization via Mermaid Graphs'
subIssuesCompleted: 1
subIssuesTotal: 5
blockedBy:
  - '[ ] 9951 Scaffold signal_state_transition MCP Endpoint'
blocking: []
---
# Epic: Abstracting the Operating Environment (Agent OS v3)

### Goal
Provide a native, secure operating environment wrapper for Swarm Agents that abstracts Orchestrator tracking and MCP Schema routing into high-level tools. This Epic prevents prompt-bloat ("Catastrophic Context Collapse") by reducing unstructured state transitions.

### Implementation Paradigm
Instead of treating LLM agents like human Terminal Operators by waiting for conversational "I am done" strings, we provide robust state signaling endpoints (e.g., `signal_state_transition`) allowing the Node.js OS to securely trap the repository state while allowing the Frontier models to retain raw Git CLI access.

### Sub-Issues
- Scaffold `signal_state_transition` MCP Endpoint
- Purge Git Mandates & Optimize Dashboard
- MCP Progressive Disclosure Endpoint

## Timeline

- 2026-04-13T09:28:30Z @tobiu added the `epic` label
- 2026-04-13T09:28:30Z @tobiu added the `ai` label
- 2026-04-13T09:28:31Z @tobiu added the `architecture` label
- 2026-04-13T09:28:47Z @tobiu added sub-issue #9951
- 2026-04-13T09:28:48Z @tobiu added sub-issue #9952
- 2026-04-13T09:28:50Z @tobiu added sub-issue #9953
- 2026-04-13T09:34:19Z @tobiu added sub-issue #9957
- 2026-04-13T09:39:43Z @tobiu added sub-issue #9958
- 2026-04-13T11:13:34Z @tobiu marked this issue as being blocked by #9951
- 2026-04-13T12:49:01Z @tobiu cross-referenced by PR #9968

