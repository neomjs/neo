---
id: 7812
title: 'Fix regression: Enable HTML rendering in form field labels (valueLabel)'
state: CLOSED
labels:
  - bug
  - refactoring
  - regression
assignees:
  - tobiu
createdAt: '2025-11-19T14:56:55Z'
updatedAt: '2025-11-19T16:08:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7812'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T16:08:06Z'
---
# Fix regression: Enable HTML rendering in form field labels (valueLabel)

A regression bug was identified in `Neo.filter.BooleanContainer`. The issue arises from the shift to `domApiRenderer` as the default in `DefaultConfig.mjs`. Some setters update `vdom.text` (mapping to `element.textContent`) instead of `vdom.html`. This causes escaped strings (e.g., `<i>`) to render as text instead of HTML elements.

Specifically, `Neo.form.field.CheckBox` uses `valueLabelText` and `afterSetValueLabelText`, which sets `vdom.text`.

**Proposed Solution:**
1.  Refactor `Neo.form.field.CheckBox`:
    *   Rename `valueLabelText_` to `valueLabel_` (breaking change).
    *   Accept either a string or a VDOM object/array.
    *   If it's a string, treat it as `text`. 
2.  Update `Neo.filter.BooleanContainer` to use the new config.
3.  Find and update all usages of `valueLabelText` across the codebase (`src`, `apps`, `examples`, `docs/app`).

**Affected Files:**
- `src/form/field/CheckBox.mjs`
- `src/filter/BooleanContainer.mjs`
- All files using `valueLabelText` config on CheckBox.

## Timeline

- 2025-11-19T14:56:57Z @tobiu added the `bug` label
- 2025-11-19T14:56:57Z @tobiu added the `refactoring` label
- 2025-11-19T14:56:57Z @tobiu added the `regression` label
### @tobiu - 2025-11-19T14:57:24Z

<img width="884" height="451" alt="Image" src="https://github.com/user-attachments/assets/c54cf8a1-adc3-4cd1-9f4b-9227a649641c" />

- 2025-11-19T14:57:29Z @tobiu assigned to @tobiu
- 2025-11-19T15:52:28Z @tobiu referenced in commit `64398fb` - "Fix regression: Enable HTML rendering in form field labels (valueLabel) #7812"
### @tobiu - 2025-11-19T16:08:06Z

<img width="878" height="440" alt="Image" src="https://github.com/user-attachments/assets/423c9bd0-45df-4742-afa6-dc5ad5cd0d84" />

- 2025-11-19T16:08:06Z @tobiu closed this issue

