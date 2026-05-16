---
id: 7814
title: 'Fix regression: Replace deprecated parseConfig with createBindings in Layout.mjs'
state: CLOSED
labels:
  - bug
  - refactoring
  - regression
assignees:
  - tobiu
createdAt: '2025-11-19T16:34:59Z'
updatedAt: '2025-11-19T16:36:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7814'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T16:36:38Z'
---
# Fix regression: Replace deprecated parseConfig with createBindings in Layout.mjs

A regression bug was identified in `apps/form/view/FormContainer.mjs`, where `parseConfig()` is called on a layout. This method has been deprecated and removed in `Neo.state.Provider`.

The issue originates in `src/layout/Base.mjs`:
```javascript
    /**
     * Applies all class configs to this instance
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     */
    initConfig(config, preventOriginalConfig) {
        super.initConfig(config, preventOriginalConfig);

        let me = this;

        me.bind && me.container.getStateProvider()?.parseConfig(me)
    }
```

**Solution:**
Replace `parseConfig(me)` with `createBindings(me)` in `src/layout/Base.mjs`. The `createBindings` method in `Neo.state.Provider` correctly handles setting up reactive bindings using the new Effect-based system.

**Affected File:**
- `src/layout/Base.mjs`

**Verification:**
Verify that bindings on layouts (e.g., in `apps/form/view/FormContainer.mjs`) work correctly after the fix.

## Timeline

- 2025-11-19T16:35:00Z @tobiu added the `bug` label
- 2025-11-19T16:35:01Z @tobiu added the `refactoring` label
- 2025-11-19T16:35:01Z @tobiu added the `regression` label
- 2025-11-19T16:35:30Z @tobiu assigned to @tobiu
- 2025-11-19T16:36:28Z @tobiu referenced in commit `17e188b` - "Fix regression: Replace deprecated parseConfig with createBindings in Layout.mjs #7814"
- 2025-11-19T16:36:38Z @tobiu closed this issue

