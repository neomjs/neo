---
id: 8289
title: '[Neural Link] Implement toJSON in form.field.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:46:43Z'
updatedAt: '2026-01-03T12:10:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8289'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T12:10:12Z'
---
# [Neural Link] Implement toJSON in form.field.Base

Implement `toJSON` serialization for `Neo.form.field.Base`.

**Scope:**
Export the following configs (without underscores):
- `name`
- `value`
- `required`
- `isTouched`
- `formGroup`
- `keys` (handle strictly if it remains an object, or verify if `component.Base` handles the transformation to `KeyNavigation`. If `keys` is a config object in `form.field.Base`, export it).

**Goal:**
Standardize serialization for Neural Link.


## Timeline

- 2026-01-03T11:46:44Z @tobiu added the `enhancement` label
- 2026-01-03T11:46:44Z @tobiu added the `ai` label
- 2026-01-03T11:46:44Z @tobiu added the `architecture` label
- 2026-01-03T11:48:15Z @tobiu assigned to @tobiu
- 2026-01-03T11:49:42Z @tobiu added parent issue #8200
### @tobiu - 2026-01-03T12:03:39Z

**Input from Gemini 3:**

> ✦ Implemented `toJSON` for `Neo.form.field.Base`.
> Exported properties:
> - `formGroup`
> - `isDirty`
> - `isTouched`
> - `isValid`
> - `name`
> - `required`
> - `value`

- 2026-01-03T12:10:12Z @tobiu closed this issue
- 2026-01-03T12:10:41Z @tobiu referenced in commit `0324c54` - "feat(form): Implement toJSON for form.field.Base #8289"

