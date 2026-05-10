---
id: 9305
title: 'Fix: StateProvider `createBinding` overwrites multi-bindings and leaks effects'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-25T18:52:15Z'
updatedAt: '2026-02-25T19:20:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9305'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-25T18:58:40Z'
---
# Fix: StateProvider `createBinding` overwrites multi-bindings and leaks effects

When a component has multiple bindings (e.g. `bind: {text: ..., disabled: ...}`), `Neo.state.Provider.createBinding()` used the `componentId` as the key for its internal `#bindingEffects` map. This caused subsequent bindings to overwrite previous ones in the map, losing track of them for cleanup.

Additionally, if a developer dynamically re-assigned a binding to the same config key, the old `Neo.core.Effect` was never destroyed, leading to memory leaks and conflicting reactivity updates.

This fix:
1. Changes the `#bindingEffects` map key to be unique per config: `${componentId}-${configKey}`.
2. Ensures that if a binding is re-assigned on an existing `mapKey`, the old `Effect` is properly `destroy()`ed before the new one is created.

## Timeline

- 2026-02-25T18:52:16Z @tobiu added the `bug` label
- 2026-02-25T18:52:16Z @tobiu added the `ai` label
- 2026-02-25T18:52:53Z @tobiu referenced in commit `8430a1e` - "fix(state): Fix multi-binding overwrites and effect leaks in `createBinding` (#9305)"
### @tobiu - 2026-02-25T18:53:38Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully updated `src/state/Provider.mjs` to use a unique `${componentId}-${configKey}` map key in `createBinding`.
> 
> Additionally, if a dynamically assigned binding overwrites an existing key, the old `Effect` is now safely `destroy()`ed before the new one is created.
> 
> I have committed and pushed the changes to the `dev` branch. Marking this issue as resolved!

- 2026-02-25T18:58:40Z @tobiu closed this issue
- 2026-02-25T19:01:02Z @tobiu referenced in commit `9ee7aac` - "test(state): Add test for Provider multi-binding memory leaks (#9305)"
- 2026-02-25T19:20:40Z @tobiu assigned to @tobiu

