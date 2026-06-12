---
id: 8109
title: Enhance Legit Viewport UX and Fix WriteFile Signature
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-13T16:06:49Z'
updatedAt: '2025-12-13T16:07:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8109'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T16:07:48Z'
---
# Enhance Legit Viewport UX and Fix WriteFile Signature

This ticket addresses UX improvements and a necessary API update in the Legit app.

**1. Button State Management (UX)**
To prevent errors during initialization, the "New File" and "Save" buttons must be disabled by default and only enabled once the `LegitService` is ready.

- **`apps/legit/view/Viewport.mjs`:**
    - Set `disabled: true` on "New File" button.
    - Set `disabled: true` on "Save" button.
    - Add `reference: 'save-button'` to the "Save" button.

- **`apps/legit/view/ViewportController.mjs`:**
    - In `initAsync`, enable both buttons (`new-file-button`, `save-button`) after `LegitService.ready()` resolves.

**2. API Signature Fix (Bug)**
The `LegitService.writeFile` method was refactored to use a config object, but the controller calls were not updated.

- **`apps/legit/view/ViewportController.mjs`:**
    - Update `onAddFileDialogSave` to use `{data, path}`.
    - Update `onSaveButtonClick` to use `{data, path}`.


## Timeline

- 2025-12-13T16:06:50Z @tobiu added the `bug` label
- 2025-12-13T16:06:50Z @tobiu added the `enhancement` label
- 2025-12-13T16:06:50Z @tobiu added the `ai` label
- 2025-12-13T16:06:50Z @tobiu added the `refactoring` label
- 2025-12-13T16:07:21Z @tobiu assigned to @tobiu
- 2025-12-13T16:07:40Z @tobiu referenced in commit `a74681f` - "Enhance Legit Viewport UX and Fix WriteFile Signature #8109"
- 2025-12-13T16:07:48Z @tobiu closed this issue

