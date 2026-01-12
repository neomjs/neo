---
id: 7813
title: 'Refactor: Enhance labelText to support VDOM and remove innerHTML usage'
state: CLOSED
labels:
  - enhancement
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T16:07:41Z'
updatedAt: '2025-11-19T16:35:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7813'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T16:35:06Z'
---
# Refactor: Enhance labelText to support VDOM and remove innerHTML usage

Refactor `labelText` config in `CheckBox` and `TextField` (and potentially other fields extending `Field`) to support `Object` (single VDOM node) and `Object[]` (array of VDOM nodes) in addition to `String`.

Crucially, this refactoring must remove the usage of `.html` (innerHTML) assignment in `afterSetLabelText` and replace it with a safer VDOM-based approach (setting `.vdom` or `.cn` and `.text`), similar to the recent `valueLabel` fix. This mitigates potential XSS vulnerabilities associated with `innerHTML`.

**Scope:**
- Update `src/form/field/Base.mjs` (if `labelText` is defined there) or `Text.mjs`, `CheckBox.mjs`, etc.
- Ensure `afterSetLabelText` handles String (as text), Object, and Object[].
- Verify backward compatibility for existing string-based labels (rendering as text, not HTML, unless we explicitly decide to keep HTML support for strings - *decision needed: strictly text for strings like `valueLabel`, or keep HTML support for backward compat?* -> Prompt implies "custom vdom definition (to close a XSS vulnerability)", suggesting strings should become text-only or we need a clear migration path).

**Note:** This does NOT involve renaming `labelText` to `label`, keeping the scope manageable while improving security and flexibility.

## Timeline

- 2025-11-19T16:07:42Z @tobiu added the `enhancement` label
- 2025-11-19T16:07:42Z @tobiu added the `refactoring` label
- 2025-11-19T16:08:26Z @tobiu assigned to @tobiu
- 2025-11-19T16:23:19Z @tobiu referenced in commit `885fa35` - "Refactor: Enhance labelText to support VDOM and remove innerHTML usage #7813"
- 2025-11-19T16:35:06Z @tobiu closed this issue

