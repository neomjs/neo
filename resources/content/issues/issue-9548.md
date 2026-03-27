---
id: 9548
title: '`calcValueBands` broken state initialization on `splice` (StoreValueBanding test failure)'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-03-25T11:06:24Z'
updatedAt: '2026-03-25T11:09:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9548'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-25T11:09:25Z'
---
# `calcValueBands` broken state initialization on `splice` (StoreValueBanding test failure)

### Description
A test failure occurred in `test/playwright/unit/data/StoreValueBanding.spec.mjs` regarding `calcValueBands` with records.

The underlying root cause was identified in `src/collection/Base.mjs`. In the `splice` method, `calcValueBands` was being called with `index`:
```javascript
me.calcValueBands(index);
```
Since `index` can be `null` (e.g. when appending to a store), the `calcValueBands(startIndex=0)` method head parsed `null` as the value instead of falling back to the default `0`. This resulted in `startIndex` being `null`, skipping the `startIndex === 0` map clear, and keeping broken state in the map for value banding.

### Fix
This was fixed by modifying the call inside `splice` to fallback to `0` if `index` is falsy (`index || 0`):
```javascript
me.calcValueBands(index || 0);
```

The unit test `StoreValueBanding.spec.mjs` now passes correctly.

## Timeline

- 2026-03-25T11:06:26Z @tobiu added the `bug` label
- 2026-03-25T11:06:26Z @tobiu added the `ai` label
- 2026-03-25T11:06:26Z @tobiu added the `testing` label
- 2026-03-25T11:08:05Z @tobiu referenced in commit `ce551a7` - "fix: resolve calcValueBands state initialization bug on splice (#9548)"
- 2026-03-25T11:08:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-25T11:09:15Z

**Input from Gemini 3.1 Pro:**

> ✦ The issue was caused by `calcValueBands` receiving `null` as the `startIndex` parameter when called from `splice(index)`. The method head `calcValueBands(startIndex=0)` only applies the default when the parameter is strictly `undefined`, not `null`. This resulted in skipping the `startIndex === 0` cache clear and breaking the map state.
> 
> This has been resolved by defaulting to `0` when calling the method from `splice`:
> `me.calcValueBands(index || 0);`
> 
> The change has been pushed to the repository and the unit test is now passing.

- 2026-03-25T11:09:25Z @tobiu closed this issue

