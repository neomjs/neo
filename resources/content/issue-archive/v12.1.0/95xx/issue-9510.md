---
id: 9510
title: 'Tooltip regression: dynamic domListeners bypassed reactivity and bubbling fixes'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-18T12:00:10Z'
updatedAt: '2026-03-18T12:15:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9510'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T12:15:32Z'
---
# Tooltip regression: dynamic domListeners bypassed reactivity and bubbling fixes

In Neo v12, dynamic DOM event registration (e.g., `addDomListeners`) failed due to three separate bugs in the event architecture:

1. **Reactivity Bypass:** `src/mixin/DomEvents.mjs` mutated the `this.domListeners` array in place. The `core.Config` system's `isEqual` check evaluated the identical array reference as unchanged, bypassing the `afterSetDomListeners` hook entirely. Fixed by spreading into a new array.
2. **Bubbling Cancellation:** In `src/manager/DomEvent.mjs`, the global `bubble` flag was cancelled if `!listener.bubble` was true. Since omitted configs are `undefined`, `!undefined` evaluated to true, incorrectly cancelling event bubbling for any listener that didn't explicitly set `bubble: true`. Fixed to explicitly check for `listener.bubble === false`.
3. **Boolean Parsing in Manager:** In `DomEvent.updateDomListeners`, resolving the `bubble` config used an `||` operator (`domListener.bubble || value.bubble`), losing explicitly set `false` values and failing to default to `true`. Fixed to use `hasOwnProperty`. Additionally, fixed a potential crash where `vnodeId` lacked a fallback to `config.id` if `vdom` was not present in the `register` method.

## Timeline

- 2026-03-18T12:00:12Z @tobiu added the `bug` label
- 2026-03-18T12:00:12Z @tobiu added the `ai` label
- 2026-03-18T12:00:12Z @tobiu added the `core` label
- 2026-03-18T12:00:59Z @tobiu referenced in commit `5348eb1` - "fix(core): Resolve dynamic domListeners reactivity bypass and bubble cancellation (#9510)

- Cloned domListeners array in mixin/DomEvents.mjs to ensure core.Config reactivity hooks trigger.
- Fixed bubble cancellation in manager/DomEvent.mjs to correctly check for explicit false.
- Refactored updateDomListeners in manager/DomEvent.mjs to properly use hasOwnProperty for bubble parsing.
- Added vnodeId fallback logic in manager/DomEvent.mjs register method to prevent potential crashes."
### @tobiu - 2026-03-18T12:01:14Z

**Input from Gemini 3.1 Pro:**

> ✦ Completed the fix.
> 
> Commit: 5348eb155
> 
> Resolved the following issues:
> 1.  **Bubbling Cancellation:** In `src/manager/DomEvent.mjs`, fixed the event loop check to explicitly use `listener.bubble === false` instead of `!listener.bubble`.
> 2.  **Boolean Parsing in Manager:** Fixed `DomEvent.updateDomListeners` to use `hasOwnProperty` for bubble config parsing rather than `||`.
> 3.  **vnodeId Consistent Fallback:** Added fallback logic to `config.id` in `manager/DomEvent.mjs` register method to prevent crashes when a VDOM object isn't present yet.

- 2026-03-18T12:14:49Z @tobiu referenced in commit `f1b55cc` - "refactor(core): Implement cloneOnGet for domListeners reactivity (#9510)

- Replaced defensive array spread operations inside addDomListeners and removeDomListeners.
- Updated domListeners_ config to use a descriptor with cloneOnGet: 'shallow'.
- This architectural improvement guarantees that getter-based mutations (e.g. this.domListeners.push) result in a new array reference being passed to the setter, naturally triggering core.Config's deep isEqual check and firing the reactivity hooks without requiring defensive boilerplate."
### @tobiu - 2026-03-18T12:14:59Z

**Input from Gemini 3.1 Pro:**

> ✦ Added architectural refactoring.
> 
> Commit: f1b55cc7b
> 
> Reverted the manual `[...this.domListeners]` array spread hacks in favor of a cleaner configuration-level fix: we changed the `domListeners_` config to use a descriptor with `cloneOnGet: 'shallow'`.
> 
> This ensures that any time a developer accesses `this.domListeners`, they receive a new array reference. If they mutate it (e.g. `.push()`) and assign it back, `core.Config` naturally detects the reference difference and triggers the `afterSetDomListeners` reactivity hook. This makes the system inherently more maintainable and resilient to accidental reactivity bypasses across the entire framework.

- 2026-03-18T12:15:30Z @tobiu assigned to @tobiu
- 2026-03-18T12:15:32Z @tobiu closed this issue

