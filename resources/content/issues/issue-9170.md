---
id: 9170
title: 'Regression: ComboBox labelPosition inline broken'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-15T16:13:45Z'
updatedAt: '2026-02-15T16:21:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9170'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T16:21:25Z'
---
# Regression: ComboBox labelPosition inline broken

A regression was noticed in `ComboBox` (and potentially `TextField`) when using `labelPosition: 'inline'`.
The label is missing from the DOM, specifically the center element inside `.neo-label-wrapper`.
This affects the `DevIndex` controls (Buffer Row Range, Buffer Column Range).
It likely relates to recent changes in `Country` field label generation.

Steps to reproduce:
1. Open `DevIndex` app.
2. Go to the 3rd tab (Settings) in controls.
3. Observe "Buffer Row Range" and "Buffer Column Range" fields have no visible label text, although space is reserved.

Investigate:
- `src/form/field/Text.mjs`
- `src/form/field/ComboBox.mjs`
- `src/form/field/Country.mjs`

## Timeline

- 2026-02-15T16:13:46Z @tobiu added the `bug` label
- 2026-02-15T16:13:47Z @tobiu added the `ai` label
- 2026-02-15T16:13:47Z @tobiu added the `regression` label
- 2026-02-15T16:20:40Z @tobiu referenced in commit `f80f5bc` - "fix(devindex): Override itemDefaults for ComboBox labels in Settings tab (#9170)"
- 2026-02-15T16:20:52Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T16:20:58Z

**Input from Gemini 3 Pro:**

> ✦ I have identified the issue. The `ComboBox` fields in the Settings tab were inheriting `hideLabel: true` from the container's `itemDefaults`. This caused the `Neo.form.field.Text` component to remove the label DOM element when `labelPosition: 'inline'` was active.
> 
> I have explicitly set `hideLabel: false` on the "Buffer Row Range" and "Buffer Column Range" ComboBox configurations to resolve this.
> 
> Fixed in commit: [f80f5bc59] fix(devindex): Override itemDefaults for ComboBox labels in Settings tab (#9170)

- 2026-02-15T16:21:25Z @tobiu closed this issue

