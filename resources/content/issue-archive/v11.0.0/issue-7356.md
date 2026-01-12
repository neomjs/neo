---
id: 7356
title: 'Clarify ai:add-memory command in AGENTS.md'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-04T12:38:56Z'
updatedAt: '2025-10-04T12:43:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7356'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-04T12:43:22Z'
---
# Clarify ai:add-memory command in AGENTS.md

The agent made an error when first attempting to save a memory to the core, using the incorrect `--sessionId` flag instead of the correct `--session-id`. This was because the instructions in `AGENTS.md` were not explicit about the exact command-line structure.

This ticket is to update the agent guidelines to prevent this specific error in the future.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated within the "Memory Core Protocol" section to include a clear, templated example of the `npm run ai:add-memory` command, showing the correct `--session-id` flag and argument structure.

## Timeline

- 2025-10-04T12:38:57Z @tobiu added the `documentation` label
- 2025-10-04T12:38:58Z @tobiu added the `enhancement` label
- 2025-10-04T12:38:58Z @tobiu added the `ai` label
- 2025-10-04T12:38:58Z @tobiu added parent issue #7316
- 2025-10-04T12:43:09Z @tobiu referenced in commit `4f4c86d` - "Clarify ai:add-memory command in AGENTS.md #7356"
- 2025-10-04T12:43:21Z @tobiu assigned to @tobiu
- 2025-10-04T12:43:22Z @tobiu closed this issue

