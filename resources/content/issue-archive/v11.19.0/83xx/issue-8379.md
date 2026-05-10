---
id: 8379
title: Implement Lazy Loading Support for Main Thread Addons
state: CLOSED
labels:
  - enhancement
  - architecture
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-07T12:36:33Z'
updatedAt: '2026-01-07T13:22:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8379'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T13:21:20Z'
---
# Implement Lazy Loading Support for Main Thread Addons

To optimize application startup time, we should allow Main Thread Addons to lazy-load their external dependencies (libraries) only when a remote method is actually called, rather than blocking initialization.

**Proposed Changes:**

1.  **`src/worker/mixin/RemoteMethodAccess.mjs`**
    - Update `onRemoteMethod` to check for a `shouldInterceptRemote(methodName)` method on the target instance.
    - If this returns true, the call is intercepted even if `isReady` is true.

2.  **`src/main/addon/Base.mjs`**
    - Add `useLazyLoading` config (default: false).
    - Update `construct` and `initAsync`: If `useLazyLoading` is true, `initAsync` should **not** await `loadFiles()`, allowing the addon to become "ready" immediately.
    - Implement `shouldInterceptRemote(methodName)`: Return true if the library files are not yet loaded (i.e., loading promise is pending) and the method is in `interceptRemotes`.
    - Ensure `onInterceptRemotes` triggers the file loading (via `cacheMethodCall` -> `executeLoadFiles`).

**Outcome:**
Addons configured with `useLazyLoading: true` will not block the main thread initialization. Their libraries will be fetched and executed only when the first remote method (e.g., `render`) is invoked.

## Timeline

- 2026-01-07T12:36:34Z @tobiu added the `enhancement` label
- 2026-01-07T12:36:35Z @tobiu added the `architecture` label
- 2026-01-07T12:36:35Z @tobiu added the `performance` label
- 2026-01-07T12:36:35Z @tobiu added the `core` label
- 2026-01-07T13:21:02Z @tobiu assigned to @tobiu
- 2026-01-07T13:21:21Z @tobiu closed this issue
### @tobiu - 2026-01-07T13:22:56Z

**Input from Gemini 3 Pro:**

> ✦ ## Implementation Summary & Architectural Enhancements
> 
> This ticket evolved into a significant architectural update to support efficient, non-blocking addon initialization and robust configuration inheritance.
> 
> ### 1. Lazy Loading for Main Thread Addons
> We introduced a mechanism to defer the loading of external libraries (like Mermaid.js) until they are actually needed, significantly improving application startup time.
> 
> -   **`Neo.main.addon.Base`**: Added `useLazyLoading` config.
>     -   When `true`, the addon's `construct` method leaves the `#loadFilesPromise` in a pending state.
>     -   This causes `initAsync()` to pause *after* remote registration but *before* completion. Critically, this does **not** block the Main Thread (which only waits for `remotesReady()`), but it keeps the addon's `isReady` state as `false`.
>     -   **Interception as Trigger:** Since `isReady` is false, `RemoteMethodAccess` automatically intercepts incoming remote calls (e.g., `render`). The interception logic (`cacheMethodCall`) detects the pending promise and triggers `loadFiles()`. Once loaded, the promise resolves, `initAsync` completes, `isReady` becomes `true`, and the cached call executes.
> 
> ### 2. Core Enhancement: `deepArrays` Merge Strategy
> To support robust lazy loading, we needed to ensure the `loadFiles` method (defined in `Neo.main.addon.Base`) remains accessible as a remote method even when subclasses (like `Mermaid`) define their own `remote` configs. Previously, `Neo.merge` (used by `merge: 'deep'`) replaced arrays, causing the base `loadFiles` remote definition to be lost.
> 
> -   **`Neo.mjs`**: Added `Neo.mergeDeepArrays(target, source)`. This utility performs a deep merge on objects but **concatenates and deduplicates** arrays instead of replacing them.
> -   **`Neo.mergeConfig`**: Updated to support a new strategy string: `'deepArrays'`.
> -   **`Neo.core.Config`**: Documented the new strategy.
> 
> ### 3. Base Class Updates
> -   **`Neo.core.Base`**: Updated the `remote_` config descriptor to use `merge: 'deepArrays'`. This ensures that `remote` definitions accumulate down the inheritance chain.
> -   **`Neo.main.addon.Base`**: Added `loadFiles` to the `remote` config. Thanks to the new merge strategy, this method is now automatically exposed for all addons, allowing for manual preloading from the App worker if desired.
> 
> ### 4. Pilot Implementation: Mermaid Addon
> The `Neo.main.addon.Mermaid` addon was updated to utilize `useLazyLoading: true`.
> -   It no longer blocks startup.
> -   It automatically loads the Mermaid library upon the first `render` call.
> -   It inherits the `loadFiles` remote endpoint correctly.
> 
> These changes provide a scalable pattern for integrating heavy third-party libraries without compromising the initial load performance of Neo.mjs applications.

- 2026-01-07T13:25:10Z @jonnyamsp referenced in commit `cf34f44` - "feat: Implement Lazy Loading and Deep Array Merging

Introduces 'deepArrays' merge strategy in Neo.mjs and Config.mjs to support array concatenation during config merging. Updates Neo.core.Base to use this strategy for 'remote_', ensuring inherited remote methods (like 'loadFiles') are preserved in subclasses. Implements lazy loading in Neo.main.addon.Base via 'useLazyLoading' config, preventing main thread blocking. Updates Mermaid addon and wrapper to utilize these new capabilities.

Closes #8379"

