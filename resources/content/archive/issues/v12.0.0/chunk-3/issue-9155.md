---
id: 9155
title: '[DevIndex] Grid Icon Columns fail to update on Filter change'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-14T18:46:28Z'
updatedAt: '2026-02-14T19:15:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9155'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-14T19:15:52Z'
---
# [DevIndex] Grid Icon Columns fail to update on Filter change

`Icon` and `IconLink` components (and potentially others) using `hideMode: 'visibility'` fail to reappear after being hidden.

**Diagnosis:**
The `show()` method in `src/component/Base.mjs` attempts to restore visibility by deleting the `visibility` property from the style object:
```javascript
let style = me.style;
delete style.visibility;
me.style = style;
```
However, debug logs confirm that `vdom.style` retains `{visibility: 'hidden'}` even after `me.style` becomes `{}`. This suggests that `vdom.style` (or `wrapperStyle`) might be retaining the property, or the spread merge `{...me.wrapperStyle, ...me.style}` in `updateStyle` is not clearing it as expected.

**Solution:**
Override `afterSetHidden` in `Icon.mjs` and `IconLink.mjs` to explicitly set `visibility: 'visible'` (or `null`) instead of relying on property deletion. This forces a value change that propagates to the VDOM delta.

**Long-term:**
Investigate if `Component.mjs` `show()` needs a generic fix (e.g. setting `null` instead of `delete`).

## Timeline

- 2026-02-14T18:46:29Z @tobiu added the `bug` label
- 2026-02-14T18:46:29Z @tobiu added the `ai` label
- 2026-02-14T18:46:32Z @tobiu added parent issue #9106
- 2026-02-14T18:46:45Z @tobiu assigned to @tobiu
- 2026-02-14T19:14:55Z @tobiu referenced in commit `3390cae` - "fix(core): Resolve Icon visibility update failure on Grid filtering (#9155)

- Update Component.show() to set visibility: null instead of delete to force VDOM delta
- Document persistent state behavior in style and wrapperStyle configs
- Addresses regression where filtered grid rows failed to update recycled icon visibility"
### @tobiu - 2026-02-14T19:15:10Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the Icon visibility update regression.
> 
> **Root Cause:**
> `Component.updateStyle` merges `wrapperStyle` and `style`. Since `wrapperStyle` reads the *current* `vdom.style` as a default (to support runtime hacks), styles persist in `wrapperStyle` once merged.
> `Base.show()` attempted to clear visibility by `deleting` the property from the `style` config. This removed the override but exposed the underlying "polluted" state in `wrapperStyle` (which still had `visibility: hidden`), causing the show operation to fail visually.
> 
> **Fix:**
> Updated `Base.show()` to explicitly set `style.visibility = null`. This forces a value change that overrides the polluted `wrapperStyle`, triggers the correct VDOM delta, and clears the persistence loop on the next cycle.
> 
> **Documentation:**
> Added JSDoc warnings to `style_` and `wrapperStyle_` in `Base.mjs` regarding this persistent state behavior and the need for explicit nulling.

- 2026-02-14T19:15:52Z @tobiu closed this issue
- 2026-02-14T19:19:09Z @tobiu referenced in commit `1968417` - "docs(core): Enhance Component style config documentation (#9155)

- Add intent-driven JSDoc for beforeGetWrapperStyle explaining runtime hack support
- Clarify persistent state loop risks in style_ and wrapperStyle_ configs"

