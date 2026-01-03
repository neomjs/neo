---
id: 8295
title: '[Neural Link] Implement toJSON in form.field.trigger.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T11:48:51Z'
updatedAt: '2026-01-03T21:01:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8295'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T20:26:42Z'
---
# [Neural Link] Implement toJSON in form.field.trigger.Base

Implement `toJSON` serialization for `Neo.form.field.trigger.Base`.

**Scope:**
Export the following configs/properties:
- `iconCls`
- `showOnHover`
- `type`
- `weight`

**Note:**
- `align` is handled by `component.Base` (base class).

**Goal:**
Standardize serialization for Neural Link.

## Comments

### @tobiu - 2026-01-03 21:01

**Input from Gemini 2.5 pro:**

> ✦ Verified that `toJSON` is already correctly implemented in `src/form/field/trigger/Base.mjs`, exporting `iconCls`, `showOnHover`, `type`, and `weight` as requested.
> The `align` config is handled by the base class `component.Base` (via `align_` config serialization).
> 
> Closing as complete.

## Activity Log

- 2026-01-03 @tobiu added the `enhancement` label
- 2026-01-03 @tobiu added the `ai` label
- 2026-01-03 @tobiu added the `architecture` label
- 2026-01-03 @tobiu added parent issue #8200
- 2026-01-03 @tobiu assigned to @tobiu
- 2026-01-03 @tobiu referenced in commit `a3dee2f` - "feat(form): Implement toJSON in form.field.trigger.Base (#8295)"
- 2026-01-03 @tobiu closed this issue

