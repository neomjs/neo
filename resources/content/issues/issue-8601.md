---
id: 8601
title: '[Epic] Implement Neo.container.Fragment'
state: OPEN
labels:
  - epic
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-01-13T14:34:39Z'
updatedAt: '2026-01-13T16:42:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8601'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8602 Implement Neo.container.Fragment Class & VNode Support'
  - '[x] 8603 VDOM Helper Support for Fragment Indexing & Deltas'
  - '[x] 8604 Fragment Rendering Support (DomApi & StringBased)'
  - '[x] 8605 Fragment Range Operations in DeltaUpdates'
  - '[x] 8606 Comprehensive Testing for Fragments'
  - '[ ] 8607 Advanced Fragment Lifecycle Testing (Moves & Nesting)'
subIssuesCompleted: 5
subIssuesTotal: 6
blockedBy: []
blocking: []
---
# [Epic] Implement Neo.container.Fragment

Implement a `Neo.container.Fragment` that allows grouping items without rendering a wrapper DOM element.

**Core Requirements:**
1.  **No Wrapper Node:** Renders as a range of sibling nodes in the DOM (anchored by Comments), allowing children to sit directly in the parent's layout context (e.g., CSS Grid).
2.  **Container Capability:** Supports `items` config to manage child components.
3.  **VDOM Structure:** Uses `tag: 'fragment'` in the VNode tree to maintain Component-to-VNode symmetry.
4.  **Smart Runtime Architecture:** The VDOM Helper generates high-level Fragment Deltas, and the Main Thread (`DeltaUpdates`) handles the complex DOM range manipulation locally to minimize IPC.
5.  **Multi-Window Support:** Seamlessly moving a Fragment container (and its children) to a different browser window must work out-of-the-box.
6.  **Non-Destructive Moves:** Moving items into, out of, or within Fragments in the same window must NOT trigger re-rendering (no destroy/create). It must use physical DOM moves.

**Acceptance Criteria:**
*   [x] Fragment renders with Comment Anchors (`<!-- fragment-id-start -->`) and no wrapper element.
*   [x] Fragment children participate correctly in parent CSS Grid/Flex layouts.
*   [x] Moving a Fragment to a new window works correctly.
*   [x] Moving items in/out of Fragments preserves their DOM state (focus, input values).

## Timeline

- 2026-01-13T14:34:40Z @tobiu added the `epic` label
- 2026-01-13T14:34:40Z @tobiu added the `ai` label
- 2026-01-13T14:34:40Z @tobiu added the `core` label
- 2026-01-13T14:34:41Z @tobiu added the `feature` label
- 2026-01-13T14:38:51Z @tobiu cross-referenced by #8602
- 2026-01-13T14:40:05Z @tobiu added sub-issue #8602
- 2026-01-13T14:52:56Z @tobiu cross-referenced by #8603
- 2026-01-13T14:53:37Z @tobiu added sub-issue #8603
- 2026-01-13T14:57:58Z @tobiu cross-referenced by #8604
- 2026-01-13T15:01:19Z @tobiu added sub-issue #8604
- 2026-01-13T15:09:24Z @tobiu cross-referenced by #8605
- 2026-01-13T15:10:20Z @tobiu added sub-issue #8605
- 2026-01-13T15:11:32Z @tobiu cross-referenced by #8606
- 2026-01-13T15:11:50Z @tobiu added sub-issue #8606
- 2026-01-13T15:18:04Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-13T16:28:57Z

**Input from Gemini 3 Pro:**

> ✦ All sub-tasks for this Epic have been completed and verified.
> 
> **Implementation Summary:**
> 1.  **Core Class:** `Neo.container.Fragment` (`tag: 'fragment'`, `layout: null`).
> 2.  **VDOM Engine:**
>     *   `Helper`: Updated `getPhysicalIndex` to recursively count fragment anchors and children.
>     *   `Helper`: Updated `compareAttributes` to treat fragments as transparent.
> 3.  **Rendering Engines:**
>     *   `DomApiRenderer` (Main): Renders `DocumentFragment` with `<!-- id-start -->` ... `<!-- id-end -->` anchors.
>     *   `StringFromVnode` (SSR): Generates corresponding HTML string.
> 4.  **Delta Updates:**
>     *   `insertNode`: Supports fragment insertion via renderers.
>     *   `removeNode`: Detects fragment anchors and removes the full range.
>     *   `moveNode`: Uses XPath to locate fragment anchors globally (robust against missing IDs), extracts the DOM range into a `DocumentFragment`, and moves it physically to the new location (preserving state).
> 5.  **Testing:**
>     *   Unit tests for VDOM indexing and deltas.
>     *   E2E tests verifying DOM structure (no wrappers, anchors present) and layout participation.
> 
> The feature is ready for use.

- 2026-01-13T16:37:32Z @tobiu cross-referenced by #8607
- 2026-01-13T16:37:48Z @tobiu added sub-issue #8607

