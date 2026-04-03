---
id: 9639
title: Local LLM Provider Adapter (Ollama + Gemma-4)
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-03T10:44:42Z'
updatedAt: '2026-04-03T11:02:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9639'
author: tobiu
commentsCount: 0
parentIssue: 9638
subIssues:
  - '[x] 9644 Add Neo.ai.provider.Ollama base adapter'
  - '[x] 9645 Configure Agent.mjs to orchestrate mixed providers'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2026-04-03T11:02:04Z'
---
# Local LLM Provider Adapter (Ollama + Gemma-4)

Parent Epic: #9638

## Problem
Currently, `Neo.ai.Agent` only supports the Gemini API cloud provider. To support local execution (Dream Mode / Swarm) with consumer hardware, we need a local adapter.

## Solution
Create `Neo.ai.provider.Ollama` to conform to the provider interface, targeting the Gemma-4 model.
*   Implement standard `/api/generate` and `/api/chat` interaction APIs.
*   Ensure prompt parameter structure aligns with existing agent infrastructure.

## Timeline

- 2026-04-03T10:44:44Z @tobiu added the `ai` label
- 2026-04-03T10:44:44Z @tobiu added the `architecture` label
- 2026-04-03T10:44:44Z @tobiu added the `feature` label
- 2026-04-03T10:44:57Z @tobiu added parent issue #9638
- 2026-04-03T10:46:31Z @tobiu removed the `feature` label
- 2026-04-03T10:46:32Z @tobiu added the `epic` label
- 2026-04-03T10:47:01Z @tobiu cross-referenced by #9644
- 2026-04-03T10:47:03Z @tobiu cross-referenced by #9645
- 2026-04-03T10:47:13Z @tobiu added sub-issue #9644
- 2026-04-03T10:47:17Z @tobiu added sub-issue #9645
- 2026-04-03T11:00:42Z @tobiu assigned to @tobiu
- 2026-04-03T11:02:04Z @tobiu closed this issue

