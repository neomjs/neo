---
id: 8296
title: '[Neural Link] Implement toJSON in form.Container'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-01-03T11:48:58Z'
updatedAt: '2026-01-03T11:48:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8296'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Implement toJSON in form.Container

Implement `toJSON` serialization for `Neo.form.Container`.

**Scope:**
In addition to standard container serialization, export:
- `values`: The result of `getValues()` (or `getSubmitValues()`) to capture the form's state.

**Goal:**
Standardize serialization for Neural Link.


## Activity Log

- 2026-01-03 @tobiu added the `enhancement` label
- 2026-01-03 @tobiu added the `ai` label
- 2026-01-03 @tobiu added the `architecture` label
- 2026-01-03 @tobiu added parent issue #8200

