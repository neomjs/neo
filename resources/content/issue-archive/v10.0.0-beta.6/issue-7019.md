---
id: 7019
title: Refactor `defineComponent` and Enhance Config System Documentation
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-11T16:32:07Z'
updatedAt: '2025-07-11T16:47:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7019'
author: tobiu
commentsCount: 1
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-11T16:47:26Z'
---
# Refactor `defineComponent` and Enhance Config System Documentation

## Summary

This work involved two main parts:
1.  Refactoring the `defineComponent` factory to use a more intuitive and accurate API.
2.  Significantly improving the JSDoc documentation for the core configuration system to make its powerful features more discoverable and understandable.

## 1. `defineComponent` Refactoring

The `defineComponent` function was updated to accept a `config` property in its specification object instead of the more generic `static` property.

**Before:**
```javascript
defineComponent({
    static: {
        className: '...',
        text_: 'Hello'
    }
});
```

**After:**
```javascript
defineComponent({
    config: { // More descriptive and accurate
        className: '...',
        text_: 'Hello'
    }
});
```

### Reasoning
- The key `config` directly maps to the `static config` property on the generated class, making the API more transparent and reducing the mental overhead for developers.
- The term `static` was too generic, as its only purpose was to define configs.

## 2. Configuration System JSDoc Enhancements

Extensive improvements were made to the JSDocs in `src/core/Base.mjs` and `src/Neo.mjs`.

### Key Improvements

- **`core.Base.mjs` (`static config`):**
    - Clearly distinguished between **reactive configs** (e.g., `name_`) and **non-reactive, prototype-based configs**.
    - Explicitly documented all three optional lifecycle hooks for reactive configs: `beforeGet<Name>()`, `beforeSet<Name>()`, and `afterSet<Name>()`, including their parameters.

- **`core.Base.mjs` (`applyOverwrites`):**
    - Added a detailed explanation of the `Neo.overwrites` mechanism.
    - Included a practical example demonstrating how to use overwrites to change a component's default values across an entire application, highlighting its power for reducing boilerplate code.

- **`Neo.mjs` (`setupClass`):**
    - Expanded the documentation to describe its full role as the central orchestrator of class creation.
    - Explicitly mentioned that it calls `applyOverwrites`, connecting the global overwrite mechanism to the class setup lifecycle.

## Outcome

The framework's API is now more intuitive, and the documentation for its sophisticated configuration system is significantly clearer and more comprehensive. This will lower the learning curve for new developers and serve as a better reference for experienced ones.

## Timeline

- 2025-07-11T16:32:07Z @tobiu assigned to @tobiu
- 2025-07-11T16:32:08Z @tobiu added the `enhancement` label
- 2025-07-11T16:32:08Z @tobiu added parent issue #6992
- 2025-07-11T16:34:32Z @tobiu referenced in commit `ef78b5f` - "Refactor defineComponent and Enhance Config System Documentation #7019"
- 2025-07-11T16:34:51Z @tobiu closed this issue
### @tobiu - 2025-07-11T16:45:07Z

let us enhance the `setupClass()` docs a bit more, to point out the gatekeeper role.

- 2025-07-11T16:45:07Z @tobiu reopened this issue
- 2025-07-11T16:45:40Z @tobiu referenced in commit `1f1d025` - "Enhance Config System Documentation #7019"
- 2025-07-11T16:47:26Z @tobiu closed this issue

