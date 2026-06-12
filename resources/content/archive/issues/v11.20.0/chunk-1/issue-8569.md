---
id: 8569
title: 'bug: Neo.setupClass fails to unwrap non-reactive config descriptors'
state: CLOSED
labels:
  - core
assignees:
  - tobiu
createdAt: '2026-01-12T01:00:04Z'
updatedAt: '2026-01-12T01:08:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8569'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T01:08:37Z'
---
# bug: Neo.setupClass fails to unwrap non-reactive config descriptors

`Neo.setupClass` fails to unwrap non-reactive config descriptors in the static `config` object.

**Problem:**
When a class defines a non-reactive config using a descriptor (e.g., to specify `merge: 'deep'`), `Neo.setupClass` correctly identifies the descriptor and applies the unwrapped value to the class **prototype**. However, it fails to update the **static config object** (`cfg`) with the unwrapped value.

**Consequence:**
The static `config` object retains the full descriptor object (wrapped). When this class is instantiated, `initConfig` calls `mergeConfig`. `mergeConfig` uses `staticConfig` as the default value. It attempts to merge the **wrapped descriptor** with the instance's config. This results in a corrupted config object on the instance, where the merged value contains `[isDescriptor]: true` and `value: ...` properties, instead of the intended merged structure.

**Reproduction:**
See failed test in `test/playwright/unit/container/ItemsMerging.spec.mjs`.

**Proposed Fix:**
In `src/Neo.mjs`, inside `setupClass`, ensure that `cfg[key]` is updated with the unwrapped `value` when a descriptor is processed for a non-reactive config.

## Timeline

- 2026-01-12T01:00:06Z @tobiu added the `bug` label
- 2026-01-12T01:00:06Z @tobiu added the `core` label
- 2026-01-12T01:07:36Z @tobiu referenced in commit `11189f1` - "fix: Neo.setupClass non-reactive config descriptor handling (#8569)

Ensure non-reactive configs with descriptors are unwrapped in the static config object.

Added comprehensive tests in test/playwright/unit/container/ItemsMerging.spec.mjs covering object-based items, deep merging, and nested descriptor merging."
### @tobiu - 2026-01-12T01:07:55Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the issue where `Neo.setupClass` failed to unwrap non-reactive config descriptors in the static `config` object. 
> 
> **Fix Details:**
> - Modified `src/Neo.mjs` to assign the unwrapped `value` to `cfg[key]` when a descriptor is processed for a non-reactive config.
> - This ensures that `staticConfig` (used as the default in `mergeConfig`) contains the correct value structure, not the raw descriptor.
> 
> **Verification:**
> - Created new unit tests in `test/playwright/unit/container/ItemsMerging.spec.mjs`.
> - Verified object-based items conversion.
> - Verified deep merging of proxy configs (`merge: 'deep'`).
> - Verified correct merging of nested, descriptor-based non-reactive configs in child components (the core bug).
> - Verified `Neo.mergeConfig` isolation logic.
> 
> All tests passed. This unblocks the object-based container refactoring.

- 2026-01-12T01:07:57Z @tobiu assigned to @tobiu
- 2026-01-12T01:08:06Z @tobiu cross-referenced by #8568
- 2026-01-12T01:08:17Z @tobiu removed the `bug` label
- 2026-01-12T01:08:37Z @tobiu closed this issue

