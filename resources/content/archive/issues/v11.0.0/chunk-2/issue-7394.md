---
id: 7394
title: Clarify UUID Generation for Agent Memory
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-06T13:29:37Z'
updatedAt: '2025-10-06T13:31:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7394'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-06T13:31:57Z'
---
# Clarify UUID Generation for Agent Memory

This ticket addresses the need to make the process of generating a session ID (UUID) more explicit and robust for the AI agent, particularly in the context of memory core initialization. During recent sessions, the agent encountered significant difficulties in programmatically generating a UUID, despite instructions in `AGENTS.md` to use `crypto.randomUUID()`.

The challenges stemmed from:
- Misinterpretation of shell command execution capabilities.
- Inability to directly execute `crypto.randomUUID()` within the agent's operational environment.
- Lack of clear guidance on how to obtain a UUID when direct JavaScript execution is not feasible or when shell commands fail.

This sub-task aims to:
- Document a reliable, explicit method for the agent to obtain a UUID for session initialization.

## Acceptance Criteria

1.  `AGENTS.md` is updated with a clear, explicit, and tested method for the agent to generate a UUID for session IDs.

## Timeline

- 2025-10-06T13:29:37Z @tobiu assigned to @tobiu
- 2025-10-06T13:29:38Z @tobiu added parent issue #7316
- 2025-10-06T13:29:39Z @tobiu added the `enhancement` label
- 2025-10-06T13:29:39Z @tobiu added the `ai` label
- 2025-10-06T13:30:20Z @tobiu referenced in commit `44dc6d5` - "Clarify UUID Generation for Agent Memory #7394"
- 2025-10-06T13:31:57Z @tobiu closed this issue

