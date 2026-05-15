---
id: 8568
title: 'test: Verify Object-based Container Items and Deep Merging'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-12T00:51:47Z'
updatedAt: '2026-01-12T01:08:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8568'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T01:08:55Z'
---
# test: Verify Object-based Container Items and Deep Merging

Create unit tests in `test/playwright/unit/container/ItemsMerging.spec.mjs` to verify:

1.  **Object-based Items:**
    - Defining `items` as an object with keys (references) and values (item configs).
    - Verifying they are converted to an array and references are preserved.

2.  **Nested Merging:**
    - Subclassing a container that uses object-based items.
    - Overriding the `items` config in the subclass using `merge: 'deep'`.
    - Verifying that:
        - New items are added.
        - Existing items (by key) are merged/overridden correctly.
        - Order is preserved or adjustable via `weight`.

This will validate the "Proxy Config Pattern" or any fix we implement for `Neo.setupClass` handling of reactive config descriptors.

## Timeline

- 2026-01-12T00:51:48Z @tobiu added the `enhancement` label
- 2026-01-12T00:51:48Z @tobiu added the `ai` label
- 2026-01-12T00:51:48Z @tobiu added the `testing` label
### @tobiu - 2026-01-12T01:08:05Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully verified the object-based container items and deep merging behavior with new unit tests.
> 
> **Outcomes:**
> - Created `test/playwright/unit/container/ItemsMerging.spec.mjs`.
> - **Core Bug Found & Fixed:** Identified and fixed a bug in `Neo.setupClass` where non-reactive config descriptors were not unwrapped in the static config (Fixed in #8569).
> - Confirmed that the "Proxy Config Pattern" (using a unique config like `contentItems_` with `merge: 'deep'`) allows subclasses to deeply merge item definitions.
> 
> I will now proceed with applying this pattern to the Portal containers.

- 2026-01-12T01:08:10Z @tobiu assigned to @tobiu
- 2026-01-12T01:08:55Z @tobiu closed this issue

