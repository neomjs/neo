---
id: 7335
title: Clarify Agent Memory Protocol and Tooling
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T10:56:21Z'
updatedAt: '2025-10-03T10:57:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7335'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-03T10:57:53Z'
---
# Clarify Agent Memory Protocol and Tooling

During the first live test of the memory core, the agent failed to follow the "save-then-respond" protocol due to two issues:
1.  A misinterpretation of the procedural order in `AGENTS.md`, where the memory check was not performed during initialization.
2.  A lack of clarity in the `addMemory.mjs` script's command-line interface, leading to several failed attempts to save the session history.

This ticket covers the documentation and process improvements needed to prevent these failures in the future.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated to move the memory server check into the "Session Initialization" section.
2.  The `buildScripts/ai/addMemory.mjs` script is updated with clear documentation for its command-line options, especially `--thought` and `--session-id`.

## Timeline

- 2025-10-03T10:56:21Z @tobiu assigned to @tobiu
- 2025-10-03T10:56:22Z @tobiu added the `documentation` label
- 2025-10-03T10:56:22Z @tobiu added the `enhancement` label
- 2025-10-03T10:56:22Z @tobiu added parent issue #7316
- 2025-10-03T10:57:30Z @tobiu referenced in commit `e358e2d` - "Clarify Agent Memory Protocol and Tooling #7335"
- 2025-10-03T10:57:53Z @tobiu closed this issue

