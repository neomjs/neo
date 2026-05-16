---
id: 8306
title: 'App Worker: Deep clone config in onRegisterNeoConfig to prevent side effects'
state: CLOSED
labels:
  - bug
  - core
assignees:
  - tobiu
createdAt: '2026-01-04T10:25:12Z'
updatedAt: '2026-01-04T10:35:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8306'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T10:35:43Z'
---
# App Worker: Deep clone config in onRegisterNeoConfig to prevent side effects

**Context:**
In `src/worker/App.mjs`, `onRegisterNeoConfig` stores the incoming configuration object (`msg.data`) directly into `Neo.windowConfigs` as a historical record of the window's boot configuration.

```javascript
// src/worker/App.mjs
Neo.windowConfigs[data.windowId] = data;
```

It also calls `super.onRegisterNeoConfig(msg)`, which eventually calls `Neo.merge(Neo.config, data)` in `src/worker/Base.mjs`.

**The Problem:**
`Neo.merge` performs a deep merge for plain Objects but assigns Arrays (and other types) by **reference**.
This means `Neo.config` and the `data` object in `Neo.windowConfigs` share references to any configuration arrays (e.g., `themes`, `mainThreadAddons`).

If the application runtime later mutates these arrays in `Neo.config` (e.g., `Neo.config.themes.push('new-theme')`), the modification will be reflected in `Neo.windowConfigs`, effectively corrupting the historical record. `Neo.windowConfigs` should be an immutable snapshot of the initialization state.

**Proposed Solution:**
Deep clone the `data` object before storing it in `Neo.windowConfigs` to ensure it remains a pristine snapshot, decoupled from the live `Neo.config`.

```javascript
// src/worker/App.mjs
Neo.windowConfigs[data.windowId] = Neo.clone(data, true);
```

**Acceptance Criteria:**
1.  `Neo.windowConfigs` stores a deep copy of the registration data.
2.  Mutating `Neo.config` arrays at runtime does not affect the stored window config.

## Timeline

- 2026-01-04T10:25:13Z @tobiu added the `bug` label
- 2026-01-04T10:25:13Z @tobiu added the `core` label
- 2026-01-04T10:26:40Z @tobiu assigned to @tobiu
- 2026-01-04T10:35:20Z @tobiu referenced in commit `c9b25d6` - "App Worker: Deep clone config in onRegisterNeoConfig to prevent side effects #8306"
- 2026-01-04T10:35:43Z @tobiu closed this issue

