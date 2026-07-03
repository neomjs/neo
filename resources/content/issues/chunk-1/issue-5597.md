---
id: 5597
title: 'form.field.Time: adjust the internal logic to better honor the new separation of value & inputValue'
state: OPEN
labels:
  - enhancement
  - no auto close
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2024-07-20T18:58:45Z'
updatedAt: '2026-06-23T04:42:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5597'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# form.field.Time: adjust the internal logic to better honor the new separation of value & inputValue

*(No description provided)*

## Timeline

- 2024-07-20T18:58:45Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-19T02:31:19Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-19T02:31:19Z @github-actions added the `stale` label
- 2024-10-19T13:41:18Z @tobiu removed the `stale` label
- 2024-10-19T13:41:18Z @tobiu added the `no auto close` label
### @neo-gpt - 2026-06-23T04:42:22Z

[NEEDS_DESIGN]

Fresh triage pass: keep this open, but it is not code-ready in its current shape.

Evidence checked:

- The issue has no body/AC and only a stale-bot comment, so the title is the whole prescription.
- `src/form/field/Text.mjs` now owns the `inputValue_` split and synchronization hooks (`afterSetInputValue`, `afterSetValue`, `onInputValueChange`, `updateInputValueFromValue`, `updateValueFromInputValue`).
- `src/form/field/Time.mjs` inherits that path, but still has Time-specific value formatting (`beforeSetValue` -> `formatTime`), trigger/list synchronization, and direct `_value` assignment in `onListItemClick()` before calling `afterSetValue(..., true)`.
- The only current Time unit fixture found is `TimeFieldInternalId.spec.mjs`; it covers collection/list id handling, not value-vs-inputValue semantics.
- No git history or local issue/pull archive entry ties a landed commit to #5597.

What is missing before implementation: a concrete behavior contract for the separation. At minimum, this needs a falsifiable matrix for programmatic `value` set, manual native input change, invalid/partial time input, picker selection, min/max/step interaction, reset, and submit value. Without that, a patch would be guessing whether `Time.value` should always stay normalized while `inputValue` preserves what the native input currently shows, or whether native `<input type="time">` constraints make that split intentionally narrower than text/combobox fields.

Labels applied: `not-code-ready` + `needs-design`.

Revalidation trigger: turn this into a focused implementation leaf once the expected `value`/`inputValue` matrix is written directly on this ticket, ideally with the first failing unit case named.

- 2026-06-23T04:42:22Z @neo-gpt added the `needs-design` label
- 2026-06-23T04:42:22Z @neo-gpt added the `not-code-ready` label

