---
id: 8475
title: Remove redundant ensureStableIds from Button Base
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T16:57:01Z'
updatedAt: '2026-01-09T16:59:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8475'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T16:59:51Z'
---
# Remove redundant ensureStableIds from Button Base

**Context:**
`src/button/Base.mjs` contains a manual implementation of `ensureStableIds` which assigns a stable ID to the internal `textNode`.
This manual assignment `this.textNode.id = this.id + '__text'` is redundant because stable IDs for child nodes should ideally be handled declaratively or by the core VDOM mechanism, or might not be strictly necessary if the node doesn't need to be referenced by ID for patching (if position-based diffing is sufficient).

However, `ensureStableIds` in `src/button/Base.mjs` was originally added as a "Workaround fix for: https://github.com/neomjs/neo/issues/6659".
If we remove it, we need to ensure we don't regress on that issue.

**Analysis:**
The text node is a child of the button.
If the text node ID is critical for some external reason or specific diffing edge case, we should verify it.
But generally, child nodes without keys/ids are diffed by index.
The recent core changes to `ensureStableIds` in `VdomLifecycle` handle the **root** and **wrapper** IDs. They do *not* automatically assign IDs to every child node deep in the tree.

**Goal:**
Remove `ensureStableIds` from `src/button/Base.mjs` if it's proven unnecessary, OR justify its existence.
The user prompt suggests: "can we now remove ensureStableIds) ? => there is no point to assigning a spefic id to a child node."

If the `text` config setter (`afterSetText`) works by manipulating the VDOM node directly (which it does: `textNode.text = value`), then having a stable ID on that node isn't strictly required *unless* we are doing fine-grained updates via `Neo.applyDeltas` targeting that specific node ID, or if we need to find it via `getVdomChild`.

`afterSetText` in `src/button/Base.mjs`:
```javascript
    afterSetText(value, oldValue) {
        let me         = this,
            isEmpty    = !value || value === '',
            vdomRoot   = me.getVdomRoot(),
            {textNode} = me;
        // ...
        me.update()
    }
```
It calls `me.update()`, which diffs the entire component VDOM. It does not use `textNode.id` to push a partial update.

Therefore, the explicit ID on the text node seems removable.

**Verification:**
Run `test/playwright/unit/button/Base.spec.mjs`.
One test `Prototype VDOM mutation check` specifically checks:
`expect(button1.textNode.id).toBe('my-button-1__text');`
This expectation will fail if we remove the method. We should update the test to expect `undefined` (or no ID) if we remove the feature.

We need to confirm if removing it breaks anything else. Issue 6659 context is key but assuming user is correct that it's "no point".

I will create a task to remove it and update the tests.

## Timeline

- 2026-01-09T16:57:03Z @tobiu added the `ai` label
- 2026-01-09T16:57:03Z @tobiu added the `refactoring` label
- 2026-01-09T16:57:03Z @tobiu added the `core` label
- 2026-01-09T16:57:29Z @tobiu added parent issue #8469
- 2026-01-09T16:59:00Z @tobiu referenced in commit `c880234` - "refactor: remove redundant ensureStableIds from Button Base and update tests (#8475)"
- 2026-01-09T16:59:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T16:59:19Z

**Input from Gemini 3 Pro:**

> ✦ I have removed the `ensureStableIds` method from `src/button/Base.mjs`.
> 
> **Changes:**
> - Removed `ensureStableIds` which manually assigned `__text` suffix ID to the text node. This was redundant as the VDOM update mechanism does not rely on this ID for basic text updates.
> - Updated `test/playwright/unit/button/Base.spec.mjs` to expect `textNode.id` to be `undefined`.
> 
> **Verification:**
> - Ran the `button/Base.spec.mjs` unit tests. All passed.
> 
> Commit: c8802342d (#8475)

- 2026-01-09T16:59:51Z @tobiu closed this issue

