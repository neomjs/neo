---
id: 7318
title: Create Memory Capture API
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-01T20:53:39Z'
updatedAt: '2025-10-02T09:49:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7318'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T09:49:24Z'
---
# Create Memory Capture API

This ticket involves creating a Node.js-based internal API or script that the AI agent can use to save a "memory" into the ChromaDB instance set up in the previous ticket. This is the mechanism by which the agent's state will be persisted.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/addMemory.mjs`).
2.  The script accepts the following inputs:
    -   User Prompt (text)
    -   Agent Response (text, including tool calls)
    -   Agent Thought Process (text)
3.  The script generates a semantic embedding for the combined text content.
4.  The script saves the content and its embedding as a new document in the `neo-agent-memory` ChromaDB collection, along with metadata (e.g., timestamp, session ID).

## Timeline

- 2025-10-01T20:53:39Z @tobiu assigned to @tobiu
- 2025-10-01T20:53:40Z @tobiu added the `enhancement` label
- 2025-10-01T20:53:41Z @tobiu added parent issue #7316
- 2025-10-02T09:33:03Z @tobiu referenced in commit `66523d6` - "Create Memory Capture API #7318"
- 2025-10-02T09:49:24Z @tobiu closed this issue

