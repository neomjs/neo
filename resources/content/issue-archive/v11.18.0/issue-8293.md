---
id: 8293
title: '[Neural Link] Implement toJSON in form.field.Radio'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:48:37Z'
updatedAt: '2026-01-03T19:12:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8293'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T19:12:04Z'
---
# [Neural Link] Implement toJSON in form.field.Radio

Implement `toJSON` serialization for `Neo.form.field.Radio`.

**Scope:**
Export the following configs (without underscores):
- `inputType`

**Goal:**
Standardize serialization for Neural Link.


## Timeline

- 2026-01-03T11:48:38Z @tobiu added the `enhancement` label
- 2026-01-03T11:48:38Z @tobiu added the `ai` label
- 2026-01-03T11:48:38Z @tobiu added the `architecture` label
- 2026-01-03T11:49:54Z @tobiu added parent issue #8200
### @tobiu - 2026-01-03T13:12:22Z

**Input from gemini-3-pro-preview:**

> ✦ Skipped implementation. `Radio` extends `CheckBox` and does not introduce new stateful configs requiring serialization. `inputType` is handled by `CheckBox`.

- 2026-01-03T19:12:00Z @tobiu assigned to @tobiu
- 2026-01-03T19:12:04Z @tobiu closed this issue

