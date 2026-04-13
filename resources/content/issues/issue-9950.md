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
updatedAt: '2026-04-13T09:28:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9950'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 9951 Scaffold submit_work MCP Meta-Tool'
  - '[ ] 9952 Purge Git Mandates & Optimize Dashboard'
  - '[ ] 9953 MCP Progressive Disclosure Endpoint'
subIssuesCompleted: 0
subIssuesTotal: 3
blockedBy: []
blocking: []
---
# Epic: Abstracting the Operating Environment (Agent OS v3)

### Goal
Provide a native, secure operating environment wrapper for Swarm Agents that abstracts raw Git/CLI operations into high-level MCP intents. This Epic prevents prompt-bloat ("Catastrophic Context Collapse") by removing verbose Git command tutorials from system prompts and replaces them with an overarching `submit_work` state trap.

### Implementation Paradigm
Instead of treating LLM agents like human Terminal Operators (forcing them to use `gh pr create` manually), we provide high-level abstractions where the Node.js OS securely controls the repository state. 

### Sub-Issues
- Scaffold `submit_work` MCP Meta-Tool
- Purge Git Mandates & Optimize Dashboard
- MCP Progressive Disclosure Endpoint

## Timeline

- 2026-04-13T09:28:30Z @tobiu added the `epic` label
- 2026-04-13T09:28:30Z @tobiu added the `ai` label
- 2026-04-13T09:28:31Z @tobiu added the `architecture` label
- 2026-04-13T09:28:47Z @tobiu added sub-issue #9951
- 2026-04-13T09:28:48Z @tobiu added sub-issue #9952
- 2026-04-13T09:28:50Z @tobiu added sub-issue #9953

