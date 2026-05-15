---
id: 9644
title: Add Neo.ai.provider.Ollama base adapter
state: CLOSED
labels:
  - ai
  - architecture
  - feature
assignees:
  - tobiu
createdAt: '2026-04-03T10:47:00Z'
updatedAt: '2026-04-03T10:53:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9644'
author: tobiu
commentsCount: 1
parentIssue: 9639
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T10:53:24Z'
---
# Add Neo.ai.provider.Ollama base adapter

Parent Epic: #9639

## Problem
The framework needs to interface directly with a local `ollama run gemma-4` daemon to handle the "Night Shift" REM mode tasks.

## Solution
Create `src/ai/provider/Ollama.mjs` (or equivalent location) extending a base provider.
* Implement `generateContent` mapped to the Ollama `/api/generate` endpoint.
* Implement `chat` / `sendMessage` mapped to Ollama `/api/chat`.
* Support system instructions and JSON object extraction mirroring the Gemini provider.

## Timeline

- 2026-04-03T10:47:01Z @tobiu added the `ai` label
- 2026-04-03T10:47:01Z @tobiu added the `architecture` label
- 2026-04-03T10:47:01Z @tobiu added the `feature` label
- 2026-04-03T10:47:13Z @tobiu added parent issue #9639
### @tobiu - 2026-04-03T10:50:10Z

Implementation Complete: The Neo.ai.provider.Ollama adapter has been implemented.

- 2026-04-03T10:53:22Z @tobiu assigned to @tobiu
- 2026-04-03T10:53:24Z @tobiu closed this issue
- 2026-04-03T10:53:32Z @tobiu referenced in commit `ba22ba4` - "feat: Add Neo.ai.provider.Ollama base adapter (#9644)"

