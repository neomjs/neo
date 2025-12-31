---
id: 8200
title: '[Neural Link] Implement toJSON Serialization Protocol'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-29T07:10:42Z'
updatedAt: '2025-12-29T07:11:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8200'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8224 [Neural Link] Implement toJSON in core.Base'
  - '[x] 8226 [Neural Link] Implement toJSON in component.Abstract'
  - '[x] 8225 [Neural Link] Implement toJSON in component.Base'
  - '[x] 8227 [Neural Link] Implement toJSON in button.Base'
  - '[x] 8228 [Neural Link] Implement toJSON in container.Base'
  - '[x] 8232 [Neural Link] Implement toJSON in state.Provider'
  - '[x] 8233 [Neural Link] Implement toJSON in layout.Base'
  - '[x] 8234 [Neural Link] Implement toJSON in layout.Flexbox'
  - '[x] 8235 [Neural Link] Implement toJSON in layout.Card'
  - '[x] 8236 [Neural Link] Implement toJSON in layout.Form'
subIssuesCompleted: 10
subIssuesTotal: 10
blockedBy: []
blocking: []
---
# [Neural Link] Implement toJSON Serialization Protocol

**Objective:**
Standardize how Neo.mjs instances are serialized for AI inspection (Neural Link). Currently, the Neural Link Client manually picks properties, which is brittle and unscalable. We will implement a `toJSON()` method protocol across the framework.

**Core Concept:**
Every class decides its own JSON representation. `JSON.stringify(instance)` automatically calls `toJSON()`.

**Plan:**
1.  **Phase 1: Foundation (`core.Base`, `component.Base`)**
    *   Implement `toJSON()` in `core.Base`: Export `id`, `className`, `ntype`.
    *   Implement `toJSON()` in `component.Base`: Export key layout/visibility props (`width`, `height`, `hidden`, `style`, `disabled`).
    *   **Optimization:** Ensure `toJSON` is non-recursive by default for complex object references to prevent circular dependency crashes and performance bottlenecks.

2.  **Phase 2: Common Widgets**
    *   Implement `toJSON()` for high-value components: `Button` (`text`, `iconCls`), `Label` (`text`), `Container` (`layout`).

3.  **Phase 3: Data & State**
    *   Implement `toJSON()` for `data.Model` (already exists? verify/standardize).
    *   Implement `toJSON()` for `data.Store` (summary vs full dump).

4.  **Phase 4: Client Integration**
    *   Update `NeuralLink_ComponentService` (and others) to simply call `instance.toJSON()` instead of manually constructing objects.

**Discussion Point:**
*   **Tree vs. Detail:** `getComponentTree` might need a "lightweight" serialization (just ID/ntype) vs `getComponentProperty` or `queryComponent` returning the "full" `toJSON`. We might need `toJSON(detailLevel)` or separate methods. For now, `toJSON` should be the "Detail View".

**Value:**
*   **Robustness:** No more `Client.mjs` updates when a component adds a new config.
*   **Standardization:** Uses native JS patterns.
*   **Scalability:** Distributes the maintenance load to component authors.

## Activity Log

- 2025-12-29 @tobiu added the `epic` label
- 2025-12-29 @tobiu added the `ai` label
- 2025-12-29 @tobiu added the `architecture` label
- 2025-12-29 @tobiu assigned to @tobiu
- 2025-12-31 @tobiu added sub-issue #8224
- 2025-12-31 @tobiu added sub-issue #8226
- 2025-12-31 @tobiu added sub-issue #8225
- 2025-12-31 @tobiu added sub-issue #8227
- 2025-12-31 @tobiu added sub-issue #8228
- 2025-12-31 @tobiu added sub-issue #8232
- 2025-12-31 @tobiu referenced in commit `665b841` - "docs(issue): Update ticket state for #8200 and #8232"
- 2025-12-31 @tobiu added sub-issue #8233
- 2025-12-31 @tobiu added sub-issue #8234
- 2025-12-31 @tobiu added sub-issue #8235
- 2025-12-31 @tobiu added sub-issue #8236

