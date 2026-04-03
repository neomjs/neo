---
id: 9645
title: Configure Agent.mjs to orchestrate mixed providers
state: CLOSED
labels:
  - ai
  - architecture
  - feature
assignees:
  - tobiu
createdAt: '2026-04-03T10:47:01Z'
updatedAt: '2026-04-03T10:53:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9645'
author: tobiu
commentsCount: 1
parentIssue: 9639
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T10:53:26Z'
---
# Configure Agent.mjs to orchestrate mixed providers

Parent Epic: #9639

## Problem
`Neo.ai.Agent` currently hardcodes or defaults to the Gemini API cloud provider. The swarm architecture requires agents to instantiate with varying local/cloud backends.

## Solution
* Update `Agent.mjs` configuration to accept a `provider` string (`gemini` or `ollama`).
* Dynamically instantiate the correct `Neo.ai.provider.*` class upon agent boot.

## Timeline

- 2026-04-03T10:47:03Z @tobiu added the `ai` label
- 2026-04-03T10:47:03Z @tobiu added the `architecture` label
- 2026-04-03T10:47:03Z @tobiu added the `feature` label
- 2026-04-03T10:47:17Z @tobiu added parent issue #9639
### @tobiu - 2026-04-03T10:50:13Z

Implementation Complete: Agent.mjs configurator updated for mixed providers.

- 2026-04-03T10:53:24Z @tobiu assigned to @tobiu
- 2026-04-03T10:53:26Z @tobiu closed this issue
- 2026-04-03T10:53:32Z @tobiu referenced in commit `df005a1` - "feat: Configure Agent.mjs to orchestrate mixed providers (#9645)"

