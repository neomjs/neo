---
id: 8290
title: '[Neural Link] Implement toJSON in form.field.Text'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:48:12Z'
updatedAt: '2026-01-03T12:10:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8290'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T12:10:58Z'
---
# [Neural Link] Implement toJSON in form.field.Text

Implement `toJSON` serialization for `Neo.form.field.Text`.

**Scope:**
Export the following configs (without underscores):
- `autoCapitalize`
- `autoComplete`
- `clearable`
- `editable`
- `hideLabel`
- `inputPattern`
- `inputType`
- `inputValue`
- `labelPosition`
- `labelText`
- `maxLength`
- `minLength`
- `placeholderText`
- `readOnly`
- `triggers` (serialize trigger array properly)

**Goal:**
Standardize serialization for Neural Link.


## Timeline

- 2026-01-03T11:48:13Z @tobiu added the `enhancement` label
- 2026-01-03T11:48:13Z @tobiu added the `ai` label
- 2026-01-03T11:48:13Z @tobiu added the `architecture` label
- 2026-01-03T11:49:47Z @tobiu added parent issue #8200
### @tobiu - 2026-01-03T12:09:52Z

**Input from gemini-3-pro-preview:**

> ✦ Implemented `toJSON` for `Neo.form.field.Text`.
> Exported properties:
> - `autoCapitalize`
> - `autoComplete`
> - `clearable`
> - `editable`
> - `hideLabel`
> - `inputPattern`
> - `inputType`
> - `inputValue`
> - `labelPosition`
> - `labelText`
> - `maxLength`
> - `minLength`
> - `placeholderText`
> - `readOnly`
> - `triggers`

- 2026-01-03T12:10:25Z @tobiu assigned to @tobiu
- 2026-01-03T12:10:42Z @tobiu referenced in commit `3851674` - "feat(form): Implement toJSON for form.field.Text #8290"
- 2026-01-03T12:10:58Z @tobiu closed this issue

