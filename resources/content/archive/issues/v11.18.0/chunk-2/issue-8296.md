---
id: 8296
title: '[Neural Link] Implement toJSON in form.Container'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:48:58Z'
updatedAt: '2026-01-03T21:00:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8296'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T21:00:56Z'
---
# [Neural Link] Implement toJSON in form.Container

Implement `toJSON` serialization for `Neo.form.Container`.

**Scope:**
In addition to standard container serialization, export:
- `values`: The result of `getValues()` (or `getSubmitValues()`) to capture the form's state.

**Goal:**
Standardize serialization for Neural Link.


## Timeline

- 2026-01-03T11:48:59Z @tobiu added the `enhancement` label
- 2026-01-03T11:48:59Z @tobiu added the `ai` label
- 2026-01-03T11:48:59Z @tobiu added the `architecture` label
- 2026-01-03T11:50:09Z @tobiu added parent issue #8200
- 2026-01-03T19:30:56Z @tobiu assigned to @tobiu
- 2026-01-03T20:59:17Z @tobiu referenced in commit `320b61a` - "feat(form): Implement toJSON in form.Container #8296"
### @tobiu - 2026-01-03T20:59:26Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented `toJSON` in `src/form/Container.mjs` to export the form's current values.
> 
> **Implementation Details:**
> - **Synchronous Snapshot:** The method synchronously iterates over currently instantiated child components using `ComponentManager.getChildComponents(this)`. This ensures `toJSON` remains a fast, side-effect-free snapshot of the current runtime state, aligning with the lazy-loading architecture of large forms.
> - **Value Aggregation:** It replicates the logic of `getSubmitValues` (handling names, form groups, and array-based values for CheckBoxes/Radios) to construct the `values` object.
> - **Type Safety:** Uses the auto-generated `isBasefield` flag to correctly identify form fields.
> 
> Changes committed in `feat(form): Implement toJSON in form.Container #8296`.

- 2026-01-03T21:00:56Z @tobiu closed this issue
- 2026-01-03T21:21:57Z @tobiu cross-referenced by #8304

