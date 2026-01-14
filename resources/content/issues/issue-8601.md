---
id: 8601
title: '[Epic] Implement Neo.container.Fragment'
state: CLOSED
labels:
  - epic
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-01-13T14:34:39Z'
updatedAt: '2026-01-14T01:49:14Z'
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
  - '[x] 8607 Advanced Fragment Lifecycle Testing (Moves & Nesting)'
  - '[x] 8609 Add Fragment Helper Methods to DeltaUpdates'
  - '[x] 8613 Update DeltaUpdates.insertNodeBatch to support Fragments'
  - '[x] 8611 Update DeltaUpdates.moveNode to support Fragments'
  - '[x] 8612 Update DeltaUpdates.insertNode to support Fragments'
  - '[x] 8614 Fix moveNode off-by-one error for forward moves in same parent'
  - '[x] 8615 Refactor Container to support atomic component moves'
  - '[x] 8616 Create Fragment Example App (Form Grouping)'
  - '[x] 8617 Refactor StringBasedRenderer for API Parity (Separate Creation from Insertion)'
  - '[x] 8618 Implement insertNodeBatch support for StringBasedRenderer'
  - '[x] 8619 Create Playwright Test Fixtures for Neo.mjs VDOM & State Inspection'
  - '[x] 8625 Fragment Move Operation Instability'
  - '[x] 8626 Container.insert() should be a no-op for same-index moves'
  - '[x] 8627 Fragment hidden config fails: removeNode delta missing parentId'
  - '[x] 8628 [Docs] Apply Knowledge Base Enhancement Strategy to Fragment Implementation'
  - '[x] 8629 [Docs] Create ''Fragments'' Guide in UI Building Blocks'
subIssuesCompleted: 21
subIssuesTotal: 21
blockedBy: []
blocking: []
closedAt: '2026-01-14T01:49:14Z'
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
- 2026-01-13T18:49:52Z @tobiu added sub-issue #8609
- 2026-01-13T19:03:03Z @tobiu added sub-issue #8613
- 2026-01-13T19:04:40Z @tobiu added sub-issue #8611
- 2026-01-13T19:05:29Z @tobiu added sub-issue #8612
- 2026-01-13T19:26:48Z @tobiu added sub-issue #8614
- 2026-01-13T19:49:58Z @tobiu added sub-issue #8615
- 2026-01-13T19:50:00Z @tobiu added sub-issue #8616
- 2026-01-13T19:54:51Z @tobiu added sub-issue #8617
- 2026-01-13T19:54:53Z @tobiu added sub-issue #8618
- 2026-01-13T19:54:54Z @tobiu added sub-issue #8619
- 2026-01-14T00:15:59Z @tobiu added sub-issue #8625
- 2026-01-14T00:16:02Z @tobiu added sub-issue #8626
- 2026-01-14T00:49:15Z @tobiu added sub-issue #8627
- 2026-01-14T01:14:13Z @tobiu cross-referenced by #8628
- 2026-01-14T01:14:20Z @tobiu added sub-issue #8628
- 2026-01-14T01:24:01Z @tobiu added sub-issue #8629
- 2026-01-14T01:49:14Z @tobiu closed this issue

