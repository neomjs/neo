---
id: 8566
title: Refactor Portal Shared Containers to use Declarative Object-based Items
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - 'agent-task:in-progress'
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-11T23:59:41Z'
updatedAt: '2026-01-12T01:45:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8566'
author: tobiu
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T01:45:12Z'
---
# Refactor Portal Shared Containers to use Declarative Object-based Items

Refactor `Portal.view.shared.content.Container` and `PageContainer` (and their subclasses) to eliminate the imperative `construct` method for item definition, utilizing Object-based `items` with deep merging instead of `@config`.

**Goal:**
Enable subclasses to declaratively override specific item configurations (e.g., swapping modules, setting props) by defining `items` as an Object with `merge: 'deep'`. This removes the need for manual config passing in `construct`.

**Scope:**
1.  **Refactor `Portal.view.shared.content.Container`:**
    *   Convert `items` to an Object structure in `static config`.
    *   Override `items` descriptor to use `merge: 'deep'`.
    *   Add `weight` properties to items to ensure correct ordering.
    *   Remove `construct` and pass-through configs (`treeConfig`, `pageContainerModule`, etc.).
2.  **Refactor `Portal.view.shared.content.PageContainer`:**
    *   Convert `items` to an Object structure with `merge: 'deep'`.
    *   Remove `construct` and `contentComponent` config.
3.  **Update Subclasses (`Tickets` & `Release` MainContainers/PageContainers):**
    *   Override specific item keys (e.g., `pageContainer`, `tree`) in `static config` to apply specific modules and settings.
    *   Ensure `buttonTextField` and `displayField` are set on the target items directly.

## Timeline

- 2026-01-11T23:59:42Z @tobiu added the `enhancement` label
- 2026-01-11T23:59:43Z @tobiu added the `ai` label
- 2026-01-11T23:59:43Z @tobiu added the `refactoring` label
- 2026-01-11T23:59:43Z @tobiu added the `architecture` label
### @tobiu - 2026-01-12T00:40:44Z

**Input from Gemini 3 Pro:**

> ✦ **Refactoring Attempt Post-Mortem & Architecture Recommendation**
> 
> This refactoring attempt was halted due to a discovered limitation in the `Neo.setupClass` core logic regarding inherited reactive configurations.
> 
> **The Problem:**
> We attempted to refactor `Shared.Container` to use a declarative `items` config with a descriptor (`merge: 'deep'`) to allow subclasses like `Tickets.MainContainer` to deeply merge their overrides.
> However, because `items` is already defined as a **reactive config** (`items_`) in the base `Neo.container.Base` class:
> 1. `Neo.setupClass` detects the existing setter (`hasPropertySetter: true`).
> 2. It skips updating the `config` object with the unwrapped descriptor value from `Shared.Container`.
> 3. Consequently, when `Tickets.MainContainer` attempts to merge its items, it merges against the `Base` default (empty array) instead of the `Shared` structure, effectively replacing it (shallow behavior) or causing runtime errors.
> 
> **The Solution (Proxy Config Pattern):**
> Since we decided **not** to modify `Neo.mjs` core at this time, the correct architectural solution is to introduce a **Proxy Config** in the shared intermediate class.
> 
> **Recommended Implementation Plan:**
> 
> 1.  **Shared.Container (and PageContainer):**
>     *   Define a **new** reactive config, e.g., `contentItems_`.
>     *   Use the descriptor on this *new* config: `{ [isDescriptor]: true, merge: 'deep', value: { ... } }`.
>     *   Implement `afterSetContentItems(value) { this.items = value; }`.
>     *   This works because `contentItems` is *new*, so `setupClass` handles the descriptor correctly and enables deep merging for subclasses.
> 
> 2.  **Subclasses (Tickets/Release):**
>     *   Override `contentItems` (not `items`).
>     *   The merge will function correctly (deeply), preserving the structure defined in `Shared`.
> 
> **Next Steps:**
> Restart the refactoring in a fresh session using the `contentItems_` pattern. Do NOT attempt to override `items` directly with a descriptor if the base class is `Container`.

### @tobiu - 2026-01-12T01:11:33Z

**Input from Gemini 3 Pro:**

> ✦ I will now start the refactoring of `Portal.view.shared.content.Container`.
> 
> **Plan:**
> 1.  **Refactor `Shared.Container`:**
>     *   Replace the imperative `construct()` method with a declarative `contentItems_` reactive config.
>     *   Use the "Proxy Config Pattern" verified in previous tests:
>         ```javascript
>         contentItems_: {
>             [isDescriptor]: true,
>             merge         : 'deep',
>             value         : { ... }
>         }
>         ```
>     *   Implement `afterSetContentItems` to map the value to `this.items`.
>     *   Convert the existing item array structure into an object map (e.g., `sideNav`, `splitter`, `pageContainer`, `sections`).
> 
> 2.  **Refactor `PageContainer`:**
>     *   Apply the same pattern to `Portal.view.shared.content.PageContainer`.
> 
> 3.  **Update Subclasses:**
>     *   Update `Portal.view.news.tickets.MainContainer` and `Portal.view.news.release.MainContainer` to override `contentItems` declaratively instead of using `construct` overrides.
> 
> I will begin with `Portal.view.shared.content.Container`.

- 2026-01-12T01:11:36Z @tobiu assigned to @tobiu
- 2026-01-12T01:11:40Z @tobiu added the `agent-task:in-progress` label
- 2026-01-12T01:25:08Z @tobiu referenced in commit `4ef6158` - "refactor: Migrate Portal Shared Containers to Proxy Config Pattern (#8566)

Converted imperative construct() item definition to declarative contentItems_ config. Note: Still uses @config references."
### @tobiu - 2026-01-12T01:25:11Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored the containers to use the Proxy Config Pattern.
> 
> **Current State (Stable):**
> - `Shared.Container`: Uses `contentItems_`. Uses `@config:` references. Has `treeConfig` (manual merge logic is present in the file content I just read, despite my attempt to remove it? Ah, I must have missed applying the removal of treeConfig successfully or I am misreading the flow. Wait, the file content *showed* `treeConfig: null` and the manual merge logic. So I failed to apply the "cleaner" version).
> - `PageContainer`: Uses `contentItems_`. Uses `@config:`. Has `onConstructed` fix.
> - Subclasses: Not updated to remove `treeConfig` (because I didn't successfully apply that change).
> 
> I am pushing this state as a stable checkpoint. We can refine (remove `@config`, remove `treeConfig`) in subsequent steps.

### @tobiu - 2026-01-12T01:44:29Z

**Input from Gemini 3 Pro:**

> ✦ I have refined the refactoring strategy to the **Structural Injection Pattern** to fully eliminate `@config` references and ensure strict type safety.
> 
> **The Strategy:**
> 1.  **Shared.Container:**
>     *   Replaced disparate pass-through configs (`buttonTextField`, `contentComponent`, etc.) with a unified `pageContainerConfig_` object.
>     *   Converted `treeConfig` to a reactive `treeConfig_` object.
>     *   Both configs use `{ [isDescriptor]: true, merge: 'deep' }`.
>     *   `afterSetContentItems` now injects these config objects directly into the `sideNav` and `pageContainer` items using `Neo.assignDefaults`.
> 
> 2.  **PageContainer:**
>     *   Removed `beforeSetContentComponent`.
>     *   `afterSetContentItems` now accepts the injected `contentComponent` and applies it to the `content` item.
> 
> 3.  **Subclasses (Tickets/Release):**
>     *   Now override `pageContainerConfig` and `treeConfig` declaratively in `static config`.
>     *   No longer need to define `buttonTextField` or `contentComponent` as top-level configs.
> 
> This approach strictly separates the *Structural Skeleton* (in `contentItems_`) from the *Component Configuration* (in injected config objects).

- 2026-01-12T01:44:37Z @tobiu referenced in commit `dca8a0f` - "refactor: Implement Structural Injection Pattern for Portal Containers (#8566)"
### @tobiu - 2026-01-12T01:44:58Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> - Implemented the Structural Injection Pattern.
> - Added comprehensive unit tests in `ItemsMerging.spec.mjs`.
> - Cleaned up subclasses to be purely declarative.
> - Removed all `@config` references in the refactored files.
> - Verified with `npx playwright test`.
> 
> Closing as completed.

- 2026-01-12T01:45:12Z @tobiu closed this issue

