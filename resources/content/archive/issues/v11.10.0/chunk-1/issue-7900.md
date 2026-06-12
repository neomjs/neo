---
id: 7900
title: Support `@ignoreDocs` JSDoc tag to exclude files from Docs app structure
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-11-24T14:03:51Z'
updatedAt: '2025-11-24T14:17:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7900'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-24T14:17:25Z'
---
# Support `@ignoreDocs` JSDoc tag to exclude files from Docs app structure

Some files in the `ai/` directory (like `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs`) are valid modules but are not intended to be displayed in the public Docs app. While we have implemented filtering for `ai.examples` and empty folders, we need a more declarative way to exclude specific files or classes from the Docs app navigation tree.

## Goal
Implement support for a custom JSDoc tag `@ignoreDocs`. When this tag is present in a file's top-level comment block, `jsdocx.mjs` should skip generating a structure entry for it.

## Implementation Details
1.  **Update `buildScripts/docs/jsdocx.mjs`:**
    *   In the parsing loop, check if the `docs` object (the JSDoc output for a file) contains the `@ignoreDocs` tag.
    *   If the tag is found, skip adding the item to the `neoStructure` array (or filtering it out).
    *   Ensure this check happens before or during the structure generation phase.

2.  **Usage:**
    *   Add ` * @ignoreDocs` to the top-level JSDoc comment of `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs` and potentially other query modules.

## Verification
*   Add the tag to `issueQueries.mjs`.
*   Run `npm run generate-docs-json`.
*   Verify `issueQueries` is no longer in `docs/output/structure.json`.

## Timeline

- 2025-11-24T14:03:53Z @tobiu added the `documentation` label
- 2025-11-24T14:03:53Z @tobiu added the `enhancement` label
- 2025-11-24T14:04:11Z @tobiu assigned to @tobiu
- 2025-11-24T14:17:08Z @tobiu referenced in commit `219d620` - "Support @ignoreDocs JSDoc tag to exclude files from Docs app structure #7900"
- 2025-11-24T14:17:26Z @tobiu closed this issue

