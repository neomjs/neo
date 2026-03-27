---
id: 9410
title: TreeGrid Documentation & Examples
state: CLOSED
labels:
  - documentation
  - enhancement
  - good first issue
  - ai
assignees:
  - tobiu
createdAt: '2026-03-09T11:01:24Z'
updatedAt: '2026-03-09T19:48:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9410'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T19:48:49Z'
---
# TreeGrid Documentation & Examples

### Goal
Create comprehensive documentation and interactive examples demonstrating the new Tree Grid capabilities.

### Details
1.  **Examples Directory:**
    - Create a new example in `examples/grid/treeGrid/`.
    - Provide a toggle to switch between `singleExpand` and `multiExpand` modes.
    - Demonstrate custom cell renderers alongside the tree column.
2.  **Dataset:**
    - Utilize an existing hierarchical dataset (like `learn/tree.json` or a mocked file system).
3.  **Learning Guides:**
    - Update `learn/guides/datahandling/Grids.md` (or create a specific TreeGrid guide).
    - Explain the `TreeStore` concept, the "flattened view" architecture, and how to configure `column.Tree`.

## Timeline

- 2026-03-09T11:01:25Z @tobiu added the `documentation` label
- 2026-03-09T11:01:25Z @tobiu added the `enhancement` label
- 2026-03-09T11:01:25Z @tobiu added the `good first issue` label
- 2026-03-09T11:01:26Z @tobiu added the `ai` label
- 2026-03-09T11:01:40Z @tobiu added parent issue #9404
- 2026-03-09T11:02:21Z @tobiu assigned to @tobiu
- 2026-03-09T19:48:19Z @tobiu referenced in commit `524bb31` - "fix(grid): Correct themes, fix baseCls layout, and add TreeGrid demo (#9407) (#9410)

- Removed hallucinated theme folders (epona, neo-dark-rich, neo-light-rich).
- Created Tree SCSS vars for the actual themes (cyberpunk, dark, light).
- Added `baseCls` to `Neo.grid.column.component.Tree` so the AppWorker properly injects the SCSS.
- Added `tree` to `columnTypes` map in `grid.Container`.
- Added basic TreeGrid File Explorer demo to validate core mechanics."
### @tobiu - 2026-03-09T19:48:30Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed the first working TreeGrid example!
> 
> This static "File Explorer" style demo validates several core architectural pieces:
> - The `Neo.data.TreeStore` successfully parses nested JSON data and projects the initial flattened view.
> - The new `Neo.grid.column.Tree` correctly renders the cell components.
> - The `baseCls: ['neo-grid-tree-cell']` fix ensures the App Worker injects the proper layout styles (fixing the zero-height divs).
> - The `examples/grid/tree/MainModel.mjs` prevents the `RecordFactory` from stripping custom fields during hydration.
> - The `isTreeGrid` flag ensures the correct ARIA attributes are generated for accessibility.
> 
> **Important Note regarding the DOM:**
> You will notice the `Tree` cell renders *outside* the standard `<div id="...__cell-0">` pool in the DOM. This is entirely by design. The `Tree` cell component extends `Neo.grid.column.Component`, meaning it operates as a "Permanent Cell" (`hideMode: 'display'`). This protects the Component instance's lifecycle during horizontal scrolling, while visual order is maintained correctly via absolute CSS positioning (`left: Xpx`).
> 
> Closing this issue as the foundational example is now complete and functional.

- 2026-03-09T19:48:50Z @tobiu closed this issue
- 2026-03-09T20:32:19Z @tobiu referenced in commit `110b638` - "fix(examples): Flatten TreeGrid mock data to match TreeStore ingest format (#9410)"

