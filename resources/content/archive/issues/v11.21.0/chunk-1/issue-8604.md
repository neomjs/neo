---
id: 8604
title: Fragment Rendering Support (DomApi & StringBased)
state: CLOSED
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-01-13T14:57:57Z'
updatedAt: '2026-01-13T16:04:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8604'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T16:04:09Z'
---
# Fragment Rendering Support (DomApi & StringBased)

Part of Epic #8601.

**Goal:** Update the rendering engines to handle `tag: 'fragment'` by generating the correct DOM structure (Comment Anchors + Children).

**Architectural Decision:**
Fragments must render as "transparent" containers in the DOM. They should produce:
1.  A **Start Anchor** (Comment Node: `<!-- fragment-id-start -->`)
2.  The rendered children (siblings)
3.  An **End Anchor** (Comment Node: `<!-- fragment-id-end -->`)

**Tasks:**
1.  **Update `src/vdom/util/DomApiVnodeCreator.mjs` & `src/main/render/DomApiRenderer.mjs`**:
    *   Detect `tag: 'fragment'`.
    *   Create the start/end comments.
    *   Flatten the result (return a `DocumentFragment` containing anchor-start + children + anchor-end) so the parent renderer can append it seamlessly.
2.  **Update `src/vdom/util/StringFromVnode.mjs`**:
    *   Generate the HTML string: `<!-- fragment-id-start -->` + children HTML + `<!-- fragment-id-end -->`.

## Timeline

- 2026-01-13T14:57:59Z @tobiu added the `ai` label
- 2026-01-13T14:57:59Z @tobiu added the `core` label
- 2026-01-13T14:57:59Z @tobiu added the `feature` label
- 2026-01-13T15:01:19Z @tobiu added parent issue #8601
- 2026-01-13T15:17:35Z @tobiu cross-referenced by #8601
- 2026-01-13T15:18:27Z @tobiu assigned to @tobiu
- 2026-01-13T16:03:30Z @tobiu referenced in commit `2618fd7` - "feat: Fragment Rendering Support (DomApi & StringBased) (#8604)"
### @tobiu - 2026-01-13T16:03:37Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Fragment rendering support in both engines.
> - **DomApiRenderer (Main Thread):** Renders fragments as `DocumentFragment` containing `<!-- id-start -->` + children + `<!-- id-end -->` comments.
> - **StringFromVnode (VDOM/SSR):** Generates matching HTML strings `<!-- id-start -->...<!-- id-end -->`.
> 
> Ready for DeltaUpdates range operations.

- 2026-01-13T16:04:09Z @tobiu closed this issue

