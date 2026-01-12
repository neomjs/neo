---
id: 8061
title: Map AddFileDialog Save button to ViewportController
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-08T12:40:08Z'
updatedAt: '2025-12-08T13:07:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8061'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-08T13:07:37Z'
---
# Map AddFileDialog Save button to ViewportController

Enable the "Save" button in `AddFileDialog` to trigger a method in `ViewportController`.

1.  **Update `AddFileDialog.mjs`**:
    *   Add `reference: 'filename'` to the `TextField` for easy value access.
    *   Add `handler: 'onAddFileDialogSave'` to the "Save" button.

2.  **Update `ViewportController.mjs`**:
    *   In `onNewFileButtonClick`, pass `parentComponent: me.component` when creating the dialog. This establishes a logical parent-child relationship without mounting the dialog in the Viewport's DOM, enabling the event handler to bubble up to the `ViewportController`.
    *   Implement the `onAddFileDialogSave(data)` method to handle the event.

## Timeline

- 2025-12-08T12:40:09Z @tobiu added the `enhancement` label
- 2025-12-08T12:40:09Z @tobiu added the `ai` label
- 2025-12-08T12:56:08Z @tobiu assigned to @tobiu
- 2025-12-08T12:56:24Z @tobiu referenced in commit `c414b58` - "Map AddFileDialog Save button to ViewportController #8061"
- 2025-12-08T13:07:37Z @tobiu closed this issue

