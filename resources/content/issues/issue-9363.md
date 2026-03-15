---
id: 9363
title: Chrome Window Learn funktionale Komponenten
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:39:02Z'
updatedAt: '2026-03-15T13:42:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9363'
author: kmunk-klarso
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T13:42:42Z'
---
# Chrome Window Learn funktionale Komponenten

<img width="1551" height="1043" alt="Image" src="https://github.com/user-attachments/assets/fffe2cc2-b95c-4fad-83c2-e8c768510f16" />


## Timeline

- 2026-03-06T09:39:03Z @kmunk-klarso added the `bug` label
### @tobiu - 2026-03-15T12:30:20Z

**Input from Gemini 3.1 Pro:**

> ✦ ### AI Session Post-Mortem & Implementation Strategy
> 
> During the session investigating the live preview failures for functional components, we identified two distinct issues. Due to context bloat from excessive testing, we are documenting the findings here to continue cleanly in a fresh session.
> 
> #### 1. The Executor Parsing Flaw (Resolved conceptually)
> The `NeoExecutor` was failing to parse `export default MainView;` because its regex expected a class or variable declaration (`export default class...`). 
> 
> **The Agreed Solution (Hybrid Approach):**
> Instead of relying on brittle regex to extract the `className` string to resolve the module via `Neo.ns()`, we will modify `execute()` to intercept the explicit export:
> - Update `exportRegex` to `^(\s*)export\s+(?:default\s+)?(.*)`
> - Replace `export default MainView;` with `module = MainView;` directly in the sandbox string.
> - This safely captures the exported module.
> - **Crucially:** We must *keep* the legacy `className` extraction as a fallback for the 50-100 classic live preview examples that do *not* use an `export` statement (e.g. `MainView = Neo.setupClass(MainView);`). 
> 
> #### 2. The OOP Rendering Crash (The root cause of `includes` error)
> Even with the executor fixed, the functional component crashes with: `TypeError: Cannot read properties of undefined (reading 'includes')` inside `NeoArray.add()`.
> 
> **The Context:**
> ```javascript
> createVdom(config) {
>     return {
>         ntype: 'container', // Creates an OOP Container
>         layout: {ntype: 'vbox', align: 'start'}, // Creates an OOP Flexbox layout
>         items: [...]
>     }
> }
> ```
> **The Bug:**
> 1. `FunctionalBase.mjs -> processVdomForComponents` detects `ntype: 'container'` and instantiates a classic OOP container, passing the raw VDOM object as its configuration.
> 2. The OOP Container initializes its `vbox` layout (`Flexbox.mjs`).
> 3. `Flexbox.applyRenderAttributes()` reads `{wrapperCls} = container;` and tries to add classes to it using `NeoArray.add(wrapperCls, prefix + 'container');`.
> 4. Because the raw VDOM object provided by `createVdom` did not explicitly define a `cls` array, the dynamically instantiated OOP Container somehow ends up with `wrapperCls` being `undefined` (instead of falling back to the class's default empty array). 
> 
> **Next Steps for Fresh Session:**
> - Implement the Hybrid Executor fix in `src/code/executor/Neo.mjs`.
> - Investigate exactly *why* an OOP component instantiated via `Neo.ntype(vdomTree)` loses its default `wrapperCls` array if the `vdomTree` omits it, while standard `Neo.create` calls seemingly do not. The fix likely belongs in how configs/vdom are merged during instantiation within `processVdomForComponents` or `core/Base.mjs`, **not** by hacking `NeoArray`.

### @tobiu - 2026-03-15T12:33:15Z

**Input from Gemini 3.1 Pro:**

> ✦ **Correction to the Post-Mortem (Rendering Crash):**
> 
> My previous assessment of the `includes` crash was flawed. 
> 
> When the functional component returns:
> ```javascript
> {
>     ntype: 'container',
>     layout: {ntype: 'vbox'},
>     items: [...]
> }
> ```
> `processVdomForComponents` intercepts this and correctly instantiates a pure OOP `Container`, passing this exact object as its configuration. From that point on, the OOP Container manages its own layout (`Flexbox`) and its own children (`items` -> OOP `Button`). The layout operations happen *entirely* within the standard OOP scope.
> 
> If `wrapperCls` is `undefined` when `Flexbox.applyRenderAttributes()` runs, the bug is **not** because the functional component "forgot to provide a cls array in the VDOM". The bug is that something about this specific initialization pathway (`Neo.ntype()` being called with this specific configuration shape by `processVdomForComponents`) causes the resulting OOP Container to fail to initialize its own default `vdom` structure properly. 
> 
> The next session should investigate how config merging and VDOM initialization differ when an OOP component is created dynamically via `FunctionalBase` versus a standard application startup.

- 2026-03-15T12:33:30Z @tobiu assigned to @tobiu
- 2026-03-15T12:35:18Z @tobiu referenced in commit `3d70682` - "#9363 corrected the fn cmp definitions (missing config object)"
- 2026-03-15T13:40:48Z @tobiu referenced in commit `c4eeb75` - "Fix functional component instantiation and Live Preview examples (#9363)"
- 2026-03-15T13:40:48Z @tobiu referenced in commit `7373421` - "Add unit test for Functional Component Duplicate ID bug (#9363)"
### @tobiu - 2026-03-15T13:40:58Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the fixes for the functional component live preview edge cases.
> 
> 1. **Guide Examples Updated**: The examples in `learn/gettingstarted/DescribingTheUI.md` were corrected to use a wrapper node (`cn`) instead of returning an OOP component (`ntype: 'container'`) directly as the root of the functional component. This avoids the component ID clashing and preserves the functional component's own VDOM root correctly.
> 2. **Missing Component Import**: Changed the non-existent `Calendar` import in the interop example to use `DateSelector`, ensuring it works perfectly in live preview.
> 3. **Unit Test Added**: Created a rigorous Playwright unit test (`test/playwright/unit/functional/DuplicateIdBug.spec.mjs`) that replicates the exact Live Preview teardown and re-creation flow, confirming the ID bug is resolved and ensuring no future regressions.
> 
> All changes have been successfully committed and pushed to the repository.

### @tobiu - 2026-03-15T13:42:24Z

**Input from Gemini 3.1 Pro:**

> ✦ **Architectural Root Cause Analysis:**
> 
> To clarify the exact nature of this bug: The core issue stemmed from a structural anti-pattern in the original examples. The functional components were returning a pure OOP component (e.g., `ntype: 'container'`) directly as their absolute root node, without wrapping it in a standard HTML node (like an implicit `div`). 
> 
> Using a functional component purely as a passthrough to an OOP component is architecturally pointless, as the functional component lacks its own distinct DOM root. When the framework's `processVdomForComponents` method intercepted this, it replaced the functional component's entire root `vdom` with a `createVdomReference()` pointer to the inner OOP component.
> 
> During the aggressive re-render cycle triggered by Live Preview, this caused `Helper.mjs` to crash during diffing, as the functional component's `id` and `vnode` structure completely mismatched the newly generated OOP container reference. By adjusting the examples to correctly wrap the OOP components in a standard `cn` array, the functional component maintains its own isolated root, fully resolving the ID collision and diffing errors.

- 2026-03-15T13:42:42Z @tobiu closed this issue

