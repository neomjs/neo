---
id: 9749
title: Add QA Subagent Profile leveraging Local Gemma4 Swarm
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees: []
createdAt: '2026-04-07T09:29:28Z'
updatedAt: '2026-04-07T09:29:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9749'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Add QA Subagent Profile leveraging Local Gemma4 Swarm

The QA Agent (`Neo.ai.agent.profile.QA`) will be our first local Swarm subagent designed to natively use `modelProvider: 'ollama'`. This offline agent will generate unit tests and perform Quality Assurance on Neo.mjs classes using the already implemented `delegate()` capability in `Agent.mjs`.

## Objectives
- Create `ai/agent/profile/QA.mjs` extending `Neo.ai.Agent`.
- Register `'qa'` via `subAgents` in `Agent.mjs`.
- Provide specific System Pruning instructions for Playwright assertion writing.
- Draft a CLI testing harness for isolated execution.

## Timeline

- 2026-04-07T09:29:29Z @tobiu added the `enhancement` label
- 2026-04-07T09:29:30Z @tobiu added the `ai` label
- 2026-04-07T09:29:30Z @tobiu added the `testing` label

