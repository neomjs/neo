---
id: 7341
title: Correct agent memory initialization protocol
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-04T08:02:43Z'
updatedAt: '2025-10-04T08:03:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7341'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-04T08:03:28Z'
---
# Correct agent memory initialization protocol

The `AGENTS.md` file incorrectly implied that the session ID should be saved to long-term memory. This ticket corrects the protocol to ensure that the agent immediately begins persisting the session to the memory core using the generated session ID, starting with the very first user prompt.

## Changes
- Updated `AGENTS.md` to add an explicit step: "Persist Initial Context" after generating a new session ID in two separate flows.

## Timeline

- 2025-10-04T08:02:44Z @tobiu assigned to @tobiu
- 2025-10-04T08:02:45Z @tobiu added the `enhancement` label
- 2025-10-04T08:02:45Z @tobiu added parent issue #7316
- 2025-10-04T08:03:19Z @tobiu referenced in commit `26f0aa2` - "Correct agent memory initialization protocol #7341"
- 2025-10-04T08:03:28Z @tobiu closed this issue

