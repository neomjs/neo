---
id: 9450
title: Enhance Data Worker to Instantiate Dynamically Loaded Modules
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T15:04:48Z'
updatedAt: '2026-03-12T15:36:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9450'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T15:16:48Z'
---
# Enhance Data Worker to Instantiate Dynamically Loaded Modules

### Goal
Enhance the Data Worker's remote method access to not only `import()` ES modules but also instantiate them using a provided configuration object, and wire this up to `Neo.data.Store`.

### Context
To keep the App Worker lightweight, it should not import `Parser` or `Normalizer` classes. Instead, the `Store` config will define a config object (e.g., `{ module: 'Neo.data.normalizer.Tree', childrenProperty: 'items' }`). 
When the Data Worker receives this config, it must load the module and immediately create an instance to be used by the connection pipeline.

### Acceptance Criteria
- Create a new `createInstance({config})` remote method in `Neo.worker.Data`.
- The method must `import()` the required module based on the class name or path, and then use `Neo.create(module, config)` to instantiate it.
- Store the resulting instance in the Data Worker (e.g., inside an `instances` map keyed by ID) and return the instance ID to the App Worker.
- Implement `afterSetNormalizer(value, oldValue)` in `Neo.data.Store`. If the value is a config object, it must call the Data Worker's `createInstance` via RMA to ensure the normalizer is ready before data loading begins.
- Document that Parsers and Normalizers must be classes, not singletons, to ensure thread safety.

## Timeline

- 2026-03-12T15:04:50Z @tobiu added the `enhancement` label
- 2026-03-12T15:04:50Z @tobiu added the `ai` label
- 2026-03-12T15:04:51Z @tobiu added the `architecture` label
- 2026-03-12T15:04:51Z @tobiu added the `core` label
- 2026-03-12T15:04:58Z @tobiu added parent issue #9449
- 2026-03-12T15:16:14Z @tobiu referenced in commit `4993de7` - "feat: Enhance Data Worker to Instantiate Dynamically Loaded Modules (#9450)"
### @tobiu - 2026-03-12T15:16:27Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the Data Worker instantiation mechanism.
> 
> ### Changes Made:
> - **`src/worker/Data.mjs`**: Added the `createInstance({config, path})` remote method. This method loads the module via the dynamic import logic, passes the `config` to `Neo.create()`, and stores the resulting object in a persistent `this.instances` map.
> - **`src/worker/Data.mjs`**: Exposed `createInstance` via the `remote` config.
> - **`src/data/Store.mjs`**: Updated the JSDoc for `normalizer_` to strictly document it must be an object (not a class/instance) to preserve thread boundaries.
> - **`src/data/Store.mjs`**: Implemented `afterSetNormalizer()`. It asserts that the value is a config object, defaults the `path` using the `ntype` property if missing (e.g., `normalizer-tree` resolves to `src/data/normalizer/Tree.mjs`), and invokes the Data Worker RMA. Upon success, it caches the resulting ID as `me.normalizerId`.
> 
> These updates are pushed and live.

- 2026-03-12T15:16:48Z @tobiu closed this issue
- 2026-03-12T15:36:38Z @tobiu assigned to @tobiu
- 2026-03-12T18:23:02Z @tobiu cross-referenced by #9453

