---
id: 9446
title: Fix ComboBox test failure due to internalId changes
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-03-12T09:59:45Z'
updatedAt: '2026-03-12T10:02:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9446'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T10:02:28Z'
---
# Fix ComboBox test failure due to internalId changes

The recent introduction of `internalId` into `collection.Base` and `data.RecordFactory` altered the DOM IDs generated for list items. The `ComboBox.spec.mjs` test was expecting the old ID format (e.g., `neo-list-1__AL`) but now receives `neo-list-1__neo-record-1`.

This ticket tracks the update of the test assertions in `test/playwright/component/form/field/ComboBox.spec.mjs` to match the new dynamic ID behavior using regex.

## Timeline

- 2026-03-12T09:59:46Z @tobiu added the `bug` label
- 2026-03-12T09:59:46Z @tobiu added the `ai` label
- 2026-03-12T09:59:47Z @tobiu added the `testing` label
- 2026-03-12T10:01:58Z @tobiu referenced in commit `473570e` - "test: Fix ComboBox test failure due to internalId changes (#9446)"
- 2026-03-12T10:02:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-12T10:02:27Z

Fixed by updating the `aria-activedescendant` locator to use regex matching for the new `internalId` format in the Playwright tests.

- 2026-03-12T10:02:28Z @tobiu closed this issue

