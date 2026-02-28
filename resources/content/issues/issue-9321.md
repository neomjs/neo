---
id: 9321
title: Fix VDOM diffing race condition between innerHTML and textContent
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T23:16:51Z'
updatedAt: '2026-02-26T23:19:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9321'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T23:19:02Z'
---
# Fix VDOM diffing race condition between innerHTML and textContent

This ticket addresses a severe race condition and delta payload bloat in the VDOM diffing engine (`src/vdom/Helper.mjs`) when transitioning between `innerHTML` and `textContent` states.

**The Problem:**
When a cell component (like in the DevIndex Grid) is recycled, it might switch from using `innerHTML` to `textContent` (or vice versa), or simply be cleared out. 
The previous logic in `Helper.compareAttributes` handled these properties generically:
```javascript
case 'innerHTML':
case 'textContent':
    if (value !== oldVnode[prop]) {
        delta[prop] = value
    }
```
If a new VNode used `textContent: "new"` and the old one had `innerHTML: "old"`, the engine would generate:
`{ innerHTML: undefined, textContent: "new" }`

When processed by `DeltaUpdates.updateNode(delta)`, the `for...in` loop iteration order is not guaranteed. If `innerHTML: undefined` (which evaluates to `node.innerHTML = ''`) executes *after* `node.textContent = "new"`, the DOM node is incorrectly wiped blank. Furthermore, sending `undefined` over the wire wastes bandwidth.

**The Fix:**
Separate `innerHTML` and `textContent` into their own evaluation blocks within `compareAttributes`.
Implement mutual exclusivity checks:
1. If removing `innerHTML` (it is `undefined`), but the new VNode has `textContent`, **do not** send an `innerHTML` delta. Setting `textContent` on the DOM naturally overwrites the old `innerHTML`.
2. Conversely, if removing `textContent` but adding `innerHTML`, skip the `textContent` clear delta.
3. If both are genuinely removed, explicitly normalize the delta to `innerHTML: ''` rather than sending `undefined`.

## Timeline

- 2026-02-26T23:16:52Z @tobiu added the `bug` label
- 2026-02-26T23:16:52Z @tobiu added the `ai` label
- 2026-02-26T23:18:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T23:18:42Z

**Input from Gemini 3.1 Pro:**

> ✦ The VDOM diffing logic has been updated and pushed to `dev`.
> 
> `innerHTML` and `textContent` now have their own dedicated execution blocks in `Helper.compareAttributes`.
> The logic now correctly handles mutual exclusivity:
> - If a VNode transitions from `innerHTML` to `textContent` (or vice versa), the engine skips sending a `clear` command (`undefined`) for the removed property, preventing the `DeltaUpdates` `for...in` race condition.
> - If both properties are genuinely removed, the engine explicitly sends `innerHTML: ''` instead of `undefined`, keeping the delta payload clean and explicit.
> 
> Closing this ticket.

- 2026-02-26T23:18:52Z @tobiu referenced in commit `1231fcc` - "fix(VDOM): Resolve diffing race condition between innerHTML and textContent (#9321)"
- 2026-02-26T23:19:02Z @tobiu closed this issue

