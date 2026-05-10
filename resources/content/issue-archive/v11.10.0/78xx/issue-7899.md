---
id: 7899
title: Clean up Docs App structure by filtering invalid AI modules and pruning empty folders
state: CLOSED
labels:
  - bug
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-11-24T13:53:03Z'
updatedAt: '2025-11-24T13:54:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7899'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-24T13:54:24Z'
---
# Clean up Docs App structure by filtering invalid AI modules and pruning empty folders

The integration of the `ai/` directory into the JSDoc generation process introduced non-class modules (e.g., `ai/examples`) into the Docs app navigation tree. These items, lacking proper class definitions, caused the Docs app to crash or display empty pages because they often resulted in `srcPath: null` in the generated `structure.json`.

## Goal
Refine the `buildScripts/docs/jsdocx.mjs` script to filter out these invalid items and ensure a clean navigation tree.

## Implementation Details
1.  **Filter Invalid Leaves:** Modify `jsdocx.mjs` to exclude leaf nodes from `neoStructure` where `srcPath` is `null`. This effectively removes items that `jsdocx` could not resolve to a valid source file path for the Docs app (e.g., scripts in `ai/examples`).
2.  **Prune Empty Folders:** Implement a recursive pruning logic to remove directory nodes that become empty after their children are filtered out. This ensures the navigation tree doesn't contain empty folders like `ai.examples`.
3.  **Preserve Roots:** Ensure that top-level structure (like `src` and `apps`) is preserved if valid content exists.

## Verification
- Confirm that `docs/output/structure.json` no longer contains items like `Neo.ai.examples.benchmark_scientific`.
- Confirm that valid classes like `Neo.ai.mcp.server.github-workflow.Server` are still present.
- Verify the Docs app loads without errors when navigating the tree.

## Timeline

- 2025-11-24T13:53:04Z @tobiu added the `bug` label
- 2025-11-24T13:53:04Z @tobiu added the `documentation` label
- 2025-11-24T13:53:04Z @tobiu added the `enhancement` label
- 2025-11-24T13:53:36Z @tobiu assigned to @tobiu
- 2025-11-24T13:54:06Z @tobiu referenced in commit `c3d4434` - "Clean up Docs App structure by filtering invalid AI modules and pruning empty folders #7899"
- 2025-11-24T13:54:24Z @tobiu closed this issue

