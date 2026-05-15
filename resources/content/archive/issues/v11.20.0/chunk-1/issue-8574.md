---
id: 8574
title: Allow subclasses to override config descriptors in Neo.setupClass
state: CLOSED
labels:
  - enhancement
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-01-12T02:39:55Z'
updatedAt: '2026-01-12T02:42:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8574'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T02:42:08Z'
---
# Allow subclasses to override config descriptors in Neo.setupClass

`Neo.setupClass` currently employs a "first-defined wins" strategy for merging configuration descriptors (`configDescriptors`). This prevents subclasses from overriding descriptors defined in parent classes.

**Problem:**
If a parent class (e.g., `Neo.container.Base`) defines a reactive config with a descriptor (e.g., `clone: 'shallow'`), a subclass cannot override this to use `clone: 'deep'` because the parent's descriptor takes precedence.

**Proposed Change:**
Modify the merge logic in `Neo.setupClass` to use a "last-defined wins" (or merge) strategy. If a subclass defines a descriptor for an existing key, it should be merged into the accumulated descriptor object, allowing overrides.

**Impact:**
This enables subclasses to refine configuration behaviors (like cloning strategies) without redefining the property entirely or being blocked by the base class.

**Verified:**
Verified via `test/playwright/unit/core/ConfigMerging.spec.mjs` (Prototype Pollution tests pass with `clone: 'deep'` active).

## Timeline

- 2026-01-12T02:39:56Z @tobiu added the `enhancement` label
- 2026-01-12T02:39:56Z @tobiu added the `architecture` label
- 2026-01-12T02:39:57Z @tobiu added the `core` label
- 2026-01-12T02:40:13Z @tobiu referenced in commit `038cf49` - "fix: Allow subclasses to override config descriptors in Neo.setupClass (#8574)"
### @tobiu - 2026-01-12T02:41:40Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the **Prototype Pollution** issue and verified it with unit tests.
> 
> **Fix:**
> 1.  **Core:** Updated `Neo.setupClass` to allow subclasses to override config descriptors (merge strategy: last-defined wins for same key). This ensures `clone: 'deep'` defined in subclasses is respected even if parent defined `clone: 'shallow'`.
> 2.  **Shared Containers:** Added `clone: 'deep'` to the `items` descriptor in `Shared.Container.mjs` and `PageContainer.mjs`. This forces `Neo.createConfig` to deep-clone the shared static item definitions before assigning them to the instance, isolating them from mutation by `beforeSetItems` or `parseItemConfigs`.
> 3.  **Recursion:** `mergeFrom` implementation in `parseItemConfigs` is recursive and handles Object maps correctly.
> 4.  **Verification:** `test/playwright/unit/core/ConfigMerging.spec.mjs` now passes all 4 tests, including strict pollution checks and nested object scenarios.
> 
> This ensures that "switching views" (creating new instances) no longer results in cross-contamination of configuration state (e.g. empty toolbar or wrong tree config).
> 
> Closing as completed.

- 2026-01-12T02:41:56Z @tobiu assigned to @tobiu
- 2026-01-12T02:42:08Z @tobiu closed this issue

