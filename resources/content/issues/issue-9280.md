---
id: 9280
title: 'Component: Support deep merging for `bind_` configs'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-24T01:09:30Z'
updatedAt: '2026-02-24T01:10:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9280'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T01:10:25Z'
---
# Component: Support deep merging for `bind_` configs

Currently, the `bind_` configuration in `Neo.component.Abstract` lacks a deep merge descriptor. When a component instance is created and provided with a `bind` config (e.g., `{store: 'stores.myStore'}`), it completely overwrites any class-level `bind` config (e.g., `{animateVisuals: ...}`), rather than merging them.

This leads to unexpected loss of reactive bindings defined on the prototype.

**Implementation Plan:**
- Add `[isDescriptor]: true` and `merge: 'deep'` to the `bind_` configuration in `src/component/Abstract.mjs`.
- Add unit tests in `test/playwright/unit/state/Provider.spec.mjs` to explicitly verify that class-level and instance-level bindings are correctly deep-merged.

## Timeline

- 2026-02-24T01:09:30Z @tobiu added the `enhancement` label
- 2026-02-24T01:09:30Z @tobiu added the `ai` label
- 2026-02-24T01:09:31Z @tobiu added the `core` label
- 2026-02-24T01:09:48Z @tobiu assigned to @tobiu
- 2026-02-24T01:10:03Z @tobiu referenced in commit `115965a` - "feat(component): Support deep merging for 'bind' configs (#9280)

Added '[isDescriptor]: true' and 'merge: 'deep'' to the 'bind_' configuration in 'src/component/Abstract.mjs'. This ensures that when a component instance provides a 'bind' config (e.g., '{store: ...}'), it deep-merges with the class-level 'bind' config (e.g., '{animateVisuals: ...}') rather than completely overwriting it.

Added a unit test to verify that component 'bind_' configs deep merge class and instance level bindings correctly."
### @tobiu - 2026-02-24T01:10:13Z

The framework change has been implemented and pushed to the `dev` branch.

- 2026-02-24T01:10:25Z @tobiu closed this issue

