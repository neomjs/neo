---
id: 8050
title: '[ComponentManager] Implement Logical Component Bubbling for Event Path Resolution'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-07T17:58:19Z'
updatedAt: '2025-12-07T18:01:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8050'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T18:01:04Z'
---
# [ComponentManager] Implement Logical Component Bubbling for Event Path Resolution

Refactor `Neo.manager.Component.getParentPath` to implement "Logical Component Bubbling".

**Current Behavior:**
`getParentPath` returns a strictly filtered list of registered component IDs found in the provided DOM path. It does not traverse the logical component hierarchy (e.g., `component.parent` or `parentComponent`). This causes event bubbling to fail when the DOM hierarchy is disconnected from the logical hierarchy, such as with Portals, DragProxies, or Multi-Window applications.

**Proposed Change:**
Update `getParentPath` to traverse the logical component tree once a registered component entry point is found in the DOM path.
1.  Iterate the DOM path until the **first** registered component is found.
2.  Switch to traversing the `component.parent` chain (which honors `parentComponent` config).
3.  Return this logical path.

**Advantages:**
1.  **Portals & Proxies:** Enables correct event bubbling for components that are physically detached in the DOM (e.g., appended to `document.body`) but logically belong to a specific view hierarchy (e.g., a Modal Dialog belonging to a UserModule, or a DragProxy belonging to a Dashboard).
2.  **Multi-Window Support:** Allows events to bubble "logically" across browser windows if a component in a child window declares a parent in the main window.
3.  **Consistency:** Aligns Neo.mjs event bubbling with modern UI patterns where "Portal" content behaves as if it were inline.

**Edge Cases & Risks Considered:**
1.  **"Escaping" Events:** Events from a detached dialog will now bubble to the logical parent (e.g., the Module view). Listeners on the Module view (like a generic click handler) will receive these events. This is generally desired behavior (consistent with inline dialogs) but requires developer awareness.
2.  **DOM Path Dropping:** By switching to the logical tree after the first match, we effectively drop the remainder of the raw DOM path (e.g., wrapper divs, `document.body`).
    *   **Risk:** Listeners relying on `delegate` selectors matching these dropped nodes.
    *   **Mitigation:** `DomEvent.verifyDelegationPath` uses the **full, raw DOM path** passed from the main thread, *not* the filtered component path. Therefore, delegation logic remains robust and unaffected.
3.  **Infinite Loops:** The implementation includes a check (`!componentPath.includes(parent.id)`) to prevent infinite recursion in case of circular parent references.

This change fundamentally improves the framework's ability to handle complex, detached UI architectures while maintaining backward compatibility for standard hierarchies.

## Timeline

- 2025-12-07T17:58:20Z @tobiu added the `enhancement` label
- 2025-12-07T17:58:20Z @tobiu added the `ai` label
- 2025-12-07T17:58:20Z @tobiu added the `architecture` label
- 2025-12-07T17:59:16Z @tobiu assigned to @tobiu
- 2025-12-07T18:00:22Z @tobiu referenced in commit `1070193` - "[ComponentManager] Implement Logical Component Bubbling for Event Path Resolution #8050"
- 2025-12-07T18:01:04Z @tobiu closed this issue

