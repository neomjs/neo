---
id: 8149
title: 'Architecture: Migrate from ''main'' destination to explicit Window IDs'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-19T22:27:50Z'
updatedAt: '2025-12-21T16:04:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8149'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-21T16:04:16Z'
---
# Architecture: Migrate from 'main' destination to explicit Window IDs

This epic proposes a fundamental architectural shift to **replace** the ambiguous `destination: 'main'` with explicit `windowId`s for all cross-worker communication.

**The Problem:**
In a multi-window environment (SharedWorker), "Main" is a relative term. To the App Worker, multiple connected windows are just different clients (ports).
Currently, code uses `sendMessage('main', {windowId: '...'})`. This relies on `Neo.worker.Base#sendMessage` inspecting the *options* to find the correct port, with a dangerous fallback to `ports[0]` if the ID is missing.

**The Solution:**
Stop using the generic string `'main'` as a destination. Instead, `sendMessage` should accept the target `windowId` directly as the `destination` argument.

**Target API:**
```javascript
// Old
Neo.currentWorker.sendMessage('main', {windowId: 'uuid-123', action: 'foo'});

// New
Neo.currentWorker.sendMessage('uuid-123', {action: 'foo'});
```

**Benefits:**
1.  **Ambiguity Elimination:** "Main" as a concept disappears from the routing layer. The destination is always a specific, absolute client.
2.  **Routing Simplicity:** `sendMessage` becomes a simple lookup: `ports[dest]`. No complex `if/else` logic to check options for IDs.
3.  **Debugging:** Logs like `destination: "uuid-123"` are instantly clear.
4.  **Future-Proofing:** Aligns with a distributed computing model where the "main thread" is just one of many peers.

**Implementation Strategy (Phased):**

*   **Phase 1: Hybrid Support (Core Refactoring):**
    *   Update `Neo.worker.Base#sendMessage` to treat the `dest` argument as a potential `windowId` or `portId`.
    *   If `dest` matches a connected port's ID or Window ID, route to it directly.
    *   Retain `'main'` support for backward compatibility.

*   **Phase 2: Caller Migration:**
    *   Update `RemoteMethodAccess` to use the `origin` (which should be a window ID) as the `destination` for replies.
    *   Update manual calls (e.g., `App.applyDeltas`) to pass `windowId` as the first argument.

*   **Phase 3: Deprecation & Removal:**
    *   Log warnings when `destination: 'main'` is used in a SharedWorker context.
    *   Eventually remove support for `'main'` as a destination string entirely.


## Timeline

- 2025-12-19T22:27:51Z @tobiu added the `enhancement` label
- 2025-12-19T22:27:52Z @tobiu added the `epic` label
- 2025-12-19T22:27:52Z @tobiu added the `ai` label
- 2025-12-19T22:27:52Z @tobiu added the `architecture` label
- 2025-12-19T22:28:12Z @tobiu assigned to @tobiu
- 2025-12-19T23:12:33Z @tobiu referenced in commit `8004744` - "#8149 phase 1"
### @tobiu - 2025-12-19T23:13:44Z

**Input from Gemini 2.5 pro:**

> ✦ Progress Update: **Phase 1 Complete & Phase 2 In Progress**
> 
> We have successfully implemented the core architectural changes in commit `80047446741083289a7d1a3a0ec0f76320e9ad58`.
> 
> **Completed Items:**
> 1.  **Hybrid Routing Support:** `Neo.worker.Base#sendMessage` now accepts `windowId` (or port ID) directly as a destination, bypassing the legacy `'main'` fallback logic.
> 2.  **Manager Routing:** `Neo.worker.Manager` now treats its own `windowId` as equivalent to `'main'`, enabling precise targeting.
> 3.  **Auto-Migration for Remote Methods:** `RemoteMethodAccess` now automatically promotes the destination from `'main'` to `windowId` if the method payload contains a `windowId`. It also cleans the payload by removing the redundant `windowId` property.
> 4.  **Manual Migration:** Critical methods like `App.applyDeltas` and `registerApp` have been manually updated to use the new routing scheme.
> 
> **Current State:**
> The system is in a "Hybrid" state. New code (and auto-migrated remote calls) uses the strict `windowId` routing. Legacy code using `'main'` will continue to work but will now trigger a **deprecation warning** in the console when running in a SharedWorker environment.
> 
> **Next Steps:**
> Monitor the console for `sendMessage destination "main" is deprecated` warnings to identify and migrate any remaining edge cases (e.g., third-party addons or manual `sendMessage` calls).

- 2025-12-19T23:58:29Z @tobiu referenced in commit `9d58900` - "#8149 wip"
- 2025-12-20T00:04:25Z @tobiu cross-referenced by #8150
- 2025-12-20T01:30:29Z @tobiu referenced in commit `e330d2f` - "#8149 wip"
- 2025-12-20T01:31:07Z @tobiu referenced in commit `a7030bc` - "#8149 component.Base: waitForDomRect()"
- 2025-12-20T01:42:15Z @tobiu referenced in commit `e33ad53` - "#8149 form.field.Text: afterSetDisabledChars(), destroy(9"
- 2025-12-20T02:03:05Z @tobiu referenced in commit `94e2fa5` - "#8149 component.Base: alignTo(), code.LivePreview: createPopupWindow()"
- 2025-12-20T02:06:33Z @tobiu referenced in commit `b10848a` - "#8149 AgentOS.view.StrategyPanelController, AgentOS.view.ViewportController: Neo.Main.windowOpen()"
- 2025-12-20T11:44:11Z @tobiu referenced in commit `225b9fc` - "#8149 container.SortZone: startWindowDrag() => passing windowId"
- 2025-12-21T10:50:21Z @tobiu referenced in commit `b4a405c` - "#8149 main.addon.Navigator: navigateTo() => object based param"
- 2025-12-21T11:44:52Z @tobiu referenced in commit `d3d40dd` - "#8149 work in progress"
### @tobiu - 2025-12-21T11:46:02Z

**Input from Gemini 2.5 pro:**

> ✦ I have completed a comprehensive review and refactoring of `src/main/addon/*.mjs` to ensure all remote methods adhere to the required object parameter pattern. This is a critical step in Phase 2 of the migration to support explicit window IDs.
> 
> **Refactoring Summary:**
> 
> The following methods were updated to accept a single object argument (or destructure from it), ensuring compatibility with the new `windowId` injection logic:
> 
> *   **Cookie.mjs:**
>     *   `getCookie(name)` → `getCookie({name})`
>     *   `getCookies()` → `getCookies(data)`
>     *   `setCookie(value)` → `setCookie({value})`
> 
> *   **DocumentHead.mjs:**
>     *   `getCanonical()` → `getCanonical(data)`
>     *   `getDescription()` → `getDescription(data)`
>     *   `getTitle()` → `getTitle(data)`
> 
> *   **HighlightJS.mjs:**
>     *   `switchTheme(theme)` → `switchTheme({theme})`
>     *   Updated internal usages of `Stylesheet.createStyleSheet` to match its new signature.
> 
> *   **Markdown.mjs:**
>     *   `markdownToHtml(markdown)` → `markdownToHtml({markdown})`
> 
> *   **Mwc.mjs:**
>     *   `checkValidity(id)` → `checkValidity({id})`
>     *   `loadButtonModule()` → `loadButtonModule(data)`
>     *   `loadTextFieldModule()` → `loadTextFieldModule(data)`
>     *   `reportValidity(id)` → `reportValidity({id})`
> 
> *   **Stylesheet.mjs:**
>     *   `createStyleSheet(name, id, href)` → `createStyleSheet({name, id, href})`
>     *   Updated all internal calls within `Stylesheet.mjs` to use the new object signature.
> 
> **Additional Notes:**
> *   Identified and tracked a technical debt item: **#8152** ("Combine DomAccess.addScript and loadScript into a unified API") to resolve the overlap between `addScript` (remote) and `loadScript` (local helper).
> *   Verified that `DomAccess.loadScript` is currently a local helper and does not require remote method refactoring at this stage.

- 2025-12-21T12:36:28Z @tobiu referenced in commit `7d4709e` - "#8149 ensuring all "main.addon" related remote calls pass windowId"
- 2025-12-21T12:54:14Z @tobiu referenced in commit `51df23a` - "#8149 ensuring all "main.DomAccess" related remote calls pass windowId"
- 2025-12-21T12:58:11Z @tobiu referenced in commit `93dea5a` - "#8149 ensuring all "main.DomEvents" related remote calls pass windowId"
### @tobiu - 2025-12-21T16:02:30Z

**Input from Gemini 2.5 pro:**

> ✦ I have analyzed the request to challenge Phase 3. You are absolutely correct: forcing `windowId` in single-window (SPA) environments where `destination: 'main'` is unambiguous would be unnecessary friction.
> 
> **Revised Phase 3 Strategy:**
> 
> *   **SharedWorker Environments:** Strict enforcement. `destination: 'main'` is ambiguous here and will be deprecated/removed to prevent routing errors. `windowId` is mandatory.
> *   **Dedicated Worker / SPA Environments:** Permissive. `destination: 'main'` (or implicit destination) remains supported. Since there is only one Main Thread, there is no ambiguity, and forcing developers to manage `windowId` offers no architectural benefit.
> 
> **Implementation Status:**
> The current codebase already supports this distinction:
> *   `Neo.worker.Base#sendMessage` only logs the deprecation warning if `this.isSharedWorker` is true.
> *   `Neo.worker.Manager` (Main Thread) accepts messages addressed to `'main'` or its specific `windowId`.
> *   `RemoteMethodAccess` defaults to `'main'` if no `windowId` is provided, which works seamlessly in SPAs.
> 
> I will proceed with the understanding that Phase 3 "Removal" applies **only** to SharedWorker modes. No code changes are required to support this "allowance" as it is the current behavior, but we will ensure no future commits break this compatibility.

### @tobiu - 2025-12-21T16:04:15Z

Closing as Phase 3 requirements are already met by the current hybrid implementation. Strict  enforcement is applied only to SharedWorker environments, while  remains supported for standard SPAs.

- 2025-12-21T16:04:16Z @tobiu closed this issue
- 2026-01-05T19:30:55Z @tobiu cross-referenced by #8338

