---
id: 7398
title: Ensure Cross-Platform UUID Generation for Agent Memory
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees: []
createdAt: '2025-10-07T07:51:50Z'
updatedAt: '2025-10-07T08:05:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7398'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-07T08:05:44Z'
---
# Ensure Cross-Platform UUID Generation for Agent Memory

This ticket addresses a cross-platform compatibility issue in the agent's session initialization protocol. The command `node -e "console.log(crypto.randomUUID())"` specified in `AGENTS.md` for generating a session ID is not reliable on Windows Command Prompt (`cmd.exe`) due to its specific handling of double quotes.

This could prevent agents operating on Windows from successfully initializing their memory core, creating a frustrating and inconsistent experience for contributors on that platform.

This sub-task is to update the command to a more robust, cross-platform syntax that works reliably across different shell environments.

## Acceptance Criteria

1.  `AGENTS.md` is updated with a cross-platform compatible command for generating a UUID that is tested to work on Unix-like systems and Windows Command Prompt.

## Timeline

- 2025-10-07T07:51:51Z @tobiu added the `bug` label
- 2025-10-07T07:51:51Z @tobiu added parent issue #7316
- 2025-10-07T07:51:52Z @tobiu added the `enhancement` label
- 2025-10-07T07:51:52Z @tobiu added the `ai` label
- 2025-10-07T07:54:03Z @tobiu referenced in commit `b2a872e` - "Ensure Cross-Platform UUID Generation for Agent Memory #7398"
- 2025-10-07T08:05:44Z @tobiu closed this issue

