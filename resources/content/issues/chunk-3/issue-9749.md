---
id: 9749
title: Add QA Subagent Profile leveraging Local Gemma4 Swarm
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-07T09:29:28Z'
updatedAt: '2026-04-07T10:03:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9749'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T10:03:57Z'
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
- 2026-04-07T10:03:15Z @tobiu referenced in commit `5340afb` - "feat: Add QA Subagent Profile leveraging Local Gemma4 Swarm (#9749)"
- 2026-04-07T10:03:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-07T10:03:56Z

QA subagent has been configured locally with the gemma4 swarm profile. The hallucinated renderTo option was removed and component instantiation adheres to the offline environment restrictions. 100% complete.

- 2026-04-07T10:03:58Z @tobiu closed this issue

