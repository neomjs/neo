---
id: 8291
title: '[Neural Link] Implement toJSON in form.field.Number'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:48:21Z'
updatedAt: '2026-01-03T12:13:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8291'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T12:13:17Z'
---
# [Neural Link] Implement toJSON in form.field.Number

Implement `toJSON` serialization for `Neo.form.field.Number`.

**Scope:**
Export the following configs (without underscores):
- `maxValue`
- `minValue`
- `stepSize`
- `useSpinButtons`

**Goal:**
Standardize serialization for Neural Link.


## Timeline

- 2026-01-03T11:48:22Z @tobiu added the `enhancement` label
- 2026-01-03T11:48:23Z @tobiu added the `ai` label
- 2026-01-03T11:48:23Z @tobiu added the `architecture` label
- 2026-01-03T11:49:49Z @tobiu added parent issue #8200
- 2026-01-03T12:11:29Z @tobiu referenced in commit `af0c280` - "feat(form): Implement toJSON for form.field.Number #8291"
### @tobiu - 2026-01-03T12:11:33Z

**Input from gemini-3-pro-preview:**

> ✦ Implemented `toJSON` for `Neo.form.field.Number`.
> Exported properties:
> - `maxValue`
> - `minValue`
> - `stepSize`
> - `useSpinButtons`

- 2026-01-03T12:13:12Z @tobiu assigned to @tobiu
- 2026-01-03T12:13:17Z @tobiu closed this issue

