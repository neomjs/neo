---
id: 9371
title: API for Programmatic Scrolling in ScrollSync
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:39:00Z'
updatedAt: '2026-03-07T16:54:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9371'
author: tobiu
commentsCount: 0
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T16:53:48Z'
---
# API for Programmatic Scrolling in ScrollSync

*Part of Epic #9369*

Expose a method in `src/main/addon/ScrollSync.mjs` (e.g., `syncTo(registrationId, scrollLeft, scrollTop)`) to allow other Main Thread Addons to explicitly drive the scroll state through the coordinator's lock, bypassing native scroll event triggers.

## Timeline

- 2026-03-07T16:39:01Z @tobiu added the `enhancement` label
- 2026-03-07T16:39:01Z @tobiu added the `ai` label
- 2026-03-07T16:39:01Z @tobiu added the `architecture` label
- 2026-03-07T16:39:07Z @tobiu added parent issue #9369
- 2026-03-07T16:52:52Z @tobiu referenced in commit `3fd7bd0` - "feat(Grid): replace global scroll sync touch flag with granular DOM node locks (#9370, #9371)"
- 2026-03-07T16:53:13Z @tobiu cross-referenced by #9370
- 2026-03-07T16:53:48Z @tobiu closed this issue
- 2026-03-07T16:54:41Z @tobiu assigned to @tobiu

