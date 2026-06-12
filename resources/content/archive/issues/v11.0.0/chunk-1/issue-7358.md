---
id: 7358
title: Refactor `summarizeSession.mjs` to automatically summarize all un-summarized sessions
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-04T17:49:15Z'
updatedAt: '2025-10-05T09:38:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7358'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-05T09:38:33Z'
---
# Refactor `summarizeSession.mjs` to automatically summarize all un-summarized sessions

The current session summarization workflow is clunky, requiring one script to find the last session and another to summarize it. This ticket is to refactor `summarizeSession.mjs` to be more intelligent and autonomous.

## Acceptance Criteria

1.  `buildScripts/ai/summarizeSession.mjs` is updated to make the `--session-id` parameter optional.
2.  If no `session-id` is provided, the script automatically finds and summarizes all sessions that have not yet been summarized.
3.  The `buildScripts/ai/getLastSession.mjs` script is deleted.
4.  The `ai:get-last-session` script is removed from `package.json`.
5.  `AGENTS.md` is updated to reflect the new, simplified workflow for session summarization.

## Timeline

- 2025-10-04T17:49:15Z @tobiu assigned to @tobiu
- 2025-10-04T17:49:16Z @tobiu added the `enhancement` label
- 2025-10-04T17:49:16Z @tobiu added parent issue #7316
- 2025-10-04T17:49:16Z @tobiu added the `ai` label
- 2025-10-04T17:49:52Z @tobiu added the `refactoring` label
- 2025-10-04T17:51:32Z @tobiu referenced in commit `fb5198a` - "#7358 ticket as md file"
- 2025-10-05T09:38:24Z @tobiu referenced in commit `cce0ffe` - "Refactor summarizeSession.mjs to automatically summarize all un-summarized sessions #7358"
- 2025-10-05T09:38:33Z @tobiu closed this issue

