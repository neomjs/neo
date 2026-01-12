---
id: 8073
title: Duplicate childapps/preview to apps/legit for LivePreview testing
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-12-09T17:06:31Z'
updatedAt: '2025-12-09T17:16:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8073'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T17:16:04Z'
---
# Duplicate childapps/preview to apps/legit for LivePreview testing

To enable multi-window `LivePreview` functionality within the new `apps/legit` application, we need to duplicate the `childapps/preview` infrastructure from `apps/portal`.

**Tasks:**
1.  **Duplicate Infrastructure**: Copy `apps/portal/childapps/preview` (and any related configuration) to `apps/legit/childapps/preview`.
2.  **Verify Multi-Window Logic**: Ensure that the `LivePreview` component within `apps/legit` correctly opens, communicates with, and closes the pop-out window using the new internal logic.

This ticket primarily tracks the setup and verification steps for the new app environment.

## Timeline

- 2025-12-09T17:06:33Z @tobiu added the `enhancement` label
- 2025-12-09T17:06:33Z @tobiu added the `ai` label
- 2025-12-09T17:06:33Z @tobiu added the `testing` label
- 2025-12-09T17:06:46Z @tobiu assigned to @tobiu
- 2025-12-09T17:15:41Z @tobiu referenced in commit `eeef8ca` - "Duplicate childapps/preview to apps/legit for LivePreview testing #8073"
### @tobiu - 2025-12-09T17:16:04Z

I also updated appNames, mainThreadAddons, gitignore.

- 2025-12-09T17:16:04Z @tobiu closed this issue

