---
id: 8299
title: '[Neural Link] Fix missing align config in component.Base.toJSON'
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-03T19:23:56Z'
updatedAt: '2026-01-03T19:25:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8299'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T19:25:22Z'
---
# [Neural Link] Fix missing align config in component.Base.toJSON

**Objective:**
The `align` config was missed in the initial implementation of `toJSON` for `Neo.component.Base` (Issue #8225). This needs to be added to ensure proper serialization of positioning configurations.

**Scope:**
- Modify `src/component/Base.mjs`
- Update `toJSON` method to include `align: me.align`

**Context:**
This was identified while working on `form.field.trigger.Base` which also uses `align`.


## Timeline

- 2026-01-03T19:23:57Z @tobiu added the `bug` label
- 2026-01-03T19:23:57Z @tobiu added the `ai` label
- 2026-01-03T19:23:57Z @tobiu added the `architecture` label
- 2026-01-03T19:24:30Z @tobiu assigned to @tobiu
- 2026-01-03T19:24:48Z @tobiu added parent issue #8200
- 2026-01-03T19:24:59Z @tobiu referenced in commit `e72c88e` - "fix(component): Add missing align config to component.Base.toJSON (#8299)"
- 2026-01-03T19:25:22Z @tobiu closed this issue

