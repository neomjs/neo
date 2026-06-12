---
id: 8335
title: Fix toJSON mixin shadowing and implement dynamic mixin serialization
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-05T13:26:38Z'
updatedAt: '2026-01-05T13:34:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8335'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T13:34:58Z'
---
# Fix toJSON mixin shadowing and implement dynamic mixin serialization

**Problem:**
When `Neo.setupClass` applies mixins, it copies the `toJSON` method from the mixin (e.g., `Neo.core.Observable`) onto the target class's prototype. If the target class (e.g., `Neo.component.Abstract`) relies on inheritance for `toJSON` or implements its own, the mixin's version overwrites it. This results in missing data (e.g., component-specific fields) in the serialized output.

**Challenge:**
The proposed fix is to have `Neo.core.Base.prototype.toJSON` dynamically invoke `toJSON` on all applied mixins to aggregate their data. However, many mixins (like `Observable`) extend `Base` and call `super.toJSON()` in their implementation. If `Base.toJSON` calls `mixin.toJSON.call(this)`, and that mixin calls `super.toJSON()` (which resolves to `Base.toJSON`), it triggers **infinite recursion**.

**Solution:**
1.  **Prevent Shadowing:** Update `src/Neo.mjs` to add `'toJSON'` to the `ignoreMixin` list. This ensures the class's own `toJSON` (or its inherited chain) is preserved.
2.  **Dynamic Aggregation with Recursion Guard:** Update `src/core/Base.mjs`:
    -   Add a recursion guard (e.g., `this.__inToJSON`) to `toJSON`.
    -   If the method is re-entered (via a mixin calling `super`), return only the base instance data to break the loop.
    -   If it's the primary call, calculate base data, then recursively flatten `this.mixins` and invoke `toJSON` on each, merging the results.


## Timeline

- 2026-01-05T13:26:39Z @tobiu added the `bug` label
- 2026-01-05T13:26:39Z @tobiu added the `ai` label
- 2026-01-05T13:26:40Z @tobiu added the `core` label
- 2026-01-05T13:26:52Z @tobiu assigned to @tobiu
- 2026-01-05T13:27:01Z @tobiu added parent issue #8200
- 2026-01-05T13:34:11Z @tobiu referenced in commit `d8bc0e1` - "Fix toJSON mixin shadowing and implement dynamic mixin serialization (#8335)

- Add 'toJSON' to Neo.mjs ignoreMixin array to prevent shadowing
- Implement getMixins() in core/Base.mjs
- Update Base.toJSON() to aggregate mixin data and handle recursion"
### @tobiu - 2026-01-05T13:34:39Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for the `toJSON` mixin shadowing and recursion issue.
> 
> **Changes:**
> 1.  **`src/Neo.mjs`:** Added `'toJSON'` to the `ignoreMixin` array. This prevents `Neo.setupClass` from copying the `toJSON` method from a mixin to the target class's prototype, ensuring the class's own inheritance chain (or own implementation) is preserved.
> 2.  **`src/core/Base.mjs`:**
>     *   Implemented `getMixins()` helper method to recursively extract mixin classes.
>     *   Updated `toJSON()` to:
>         *   Include a recursion guard (`me.__inToJSON`) to prevent infinite loops when mixins call `super.toJSON()`.
>         *   Dynamically iterate over all applied mixins using `getMixins()`.
>         *   Invoke `toJSON` on each mixin (if present) using `call(me)` and merge the results into the serialized object.
> 
> **Verification:**
> A new unit test `test/playwright/unit/core/MixinSerialization.spec.mjs` was created and passed, confirming:
> *   Component's own `toJSON` logic is preserved.
> *   Mixin's `toJSON` logic is correctly aggregated.
> *   Base properties are present.
> *   No method shadowing occurs on the prototype.
> 
> The changes have been committed.

- 2026-01-05T13:34:59Z @tobiu closed this issue

