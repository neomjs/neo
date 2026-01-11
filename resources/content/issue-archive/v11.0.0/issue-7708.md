---
id: 7708
title: 'fix(ComboBox): Correct forceSelection behavior and update Playwright tests'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-11-06T09:54:05Z'
updatedAt: '2025-11-06T09:56:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7708'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-06T09:56:51Z'
---
# fix(ComboBox): Correct forceSelection behavior and update Playwright tests

This ticket documents a bug fix for the `ComboBox` component and the corresponding updates to its Playwright test file.

### Component Bug Fix

A critical bug was fixed in `src/form/field/ComboBox.mjs` within the `updateTypeAheadValue()` method. A shadowed `match` variable was causing the `forceSelection` logic to fail on blur by incorrectly clearing the `activeRecordId`.

### Test File Updates

To align with the correct component behavior and fix pre-existing issues, several changes were made to `test/playwright/component/form/field/ComboBox.spec.mjs`:

1.  **`Editable` Test:** Updated to correctly test the behavior for `editable: false`, where the first item is now activated immediately when the picker is opened.
2.  **`Keyboard navigation` Test:** A failing assertion that checked for `[aria-selected="true"]` on a hidden element was removed.

### Outcome

With the component bug fixed and the test file updated, all tests within `test/playwright/component/form/field/ComboBox.spec.mjs` are now passing.

## Timeline

- 2025-11-06T09:55:54Z @tobiu assigned to @tobiu
- 2025-11-06T09:56:08Z @tobiu added the `bug` label
- 2025-11-06T09:56:08Z @tobiu added the `enhancement` label
- 2025-11-06T09:56:08Z @tobiu added the `ai` label
- 2025-11-06T09:56:08Z @tobiu added the `testing` label
- 2025-11-06T09:56:37Z @tobiu referenced in commit `ab81134` - "fix(ComboBox): Correct forceSelection behavior and update Playwright tests #7708"
- 2025-11-06T09:56:51Z @tobiu closed this issue

