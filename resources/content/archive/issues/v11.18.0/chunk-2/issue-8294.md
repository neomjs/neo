---
id: 8294
title: '[Neural Link] Implement toJSON in form.field.Date'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:48:44Z'
updatedAt: '2026-01-03T19:17:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8294'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T19:17:34Z'
---
# [Neural Link] Implement toJSON in form.field.Date

# [Neural Link] Implement toJSON in form.field.Date

Implement `toJSON` serialization for `Neo.form.field.Date`.

**Scope:**
Export the following configs/properties:
- `dateSelector`: Serialized date selector instance (`me.dateSelector?.toJSON()`).
- `dateSelectorConfig`: Serialized using `serializeConfig`.
- `hidePickerOnSelect`
- `isoDate`
- `maxValue`
- `minValue`
- `submitDateObject`

**Note:**
- `inputType` is already handled by `form.field.Text` (base class).

**Goal:**
Standardize serialization for Neural Link.

## Timeline

- 2026-01-03T11:48:45Z @tobiu added the `enhancement` label
- 2026-01-03T11:48:45Z @tobiu added the `ai` label
- 2026-01-03T11:48:45Z @tobiu added the `architecture` label
- 2026-01-03T11:49:55Z @tobiu added parent issue #8200
- 2026-01-03T19:14:14Z @tobiu assigned to @tobiu
- 2026-01-03T19:16:46Z @tobiu referenced in commit `01a87c2` - "feat(form): Implement toJSON in form.field.Date (#8294)"
- 2026-01-03T19:17:34Z @tobiu closed this issue

