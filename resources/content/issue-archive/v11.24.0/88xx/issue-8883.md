---
id: 8883
title: 'Enhance ComponentTesting.md: Document `loadModule` and `importPath`'
state: CLOSED
labels:
  - documentation
  - testing
assignees:
  - tobiu
createdAt: '2026-01-26T18:36:08Z'
updatedAt: '2026-01-26T18:40:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8883'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T18:40:11Z'
---
# Enhance ComponentTesting.md: Document `loadModule` and `importPath`

The `ComponentTesting.md` guide is missing details on how to load modules dynamically, which is crucial for testing components not included in the initial app bundle.

**Requirements:**
1.  Document the `neo.loadModule({ path })` method, including the warning that it relies on dynamic imports (webpack ignored) and is intended for dev/testing only.
2.  Document the `importPath` config option in `neo.createComponent()`. Explain that this is a shortcut to lazy-load a class before instantiation, avoiding a separate `loadModule` call.
3.  Clarify that both features are primarily for the testing environment.

**References:**
- `src/worker/App.mjs` (`createNeoInstance` and `loadModule` methods)
- `test/playwright/util/RmaHelpers.mjs`

**Example to Add:**
```javascript
// Shortcut: Load and create in one step
await neo.createComponent({
    className : 'Neo.button.Base',
    importPath: '../../src/button/Base.mjs',
    text      : 'Lazy Loaded Button'
});
```

## Timeline

- 2026-01-26T18:36:09Z @tobiu added the `documentation` label
- 2026-01-26T18:36:10Z @tobiu added the `testing` label
- 2026-01-26T18:37:46Z @tobiu referenced in commit `89503d4` - "docs: Document loadModule and importPath in ComponentTesting.md (#8883)"
- 2026-01-26T18:37:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T18:38:07Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `ComponentTesting.md` guide. I added a new "Advanced: Loading Modules" section that clearly explains both the manual `loadModule` helper and the `importPath` shortcut within `createComponent`. I also included the necessary warning about these features being restricted to development and testing environments due to their reliance on dynamic imports.

- 2026-01-26T18:40:11Z @tobiu closed this issue

