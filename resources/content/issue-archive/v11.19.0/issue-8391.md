---
id: 8391
title: Update generateSeoFiles.mjs to handle tree-structured release data
state: CLOSED
labels:
  - bug
  - documentation
  - build
assignees:
  - tobiu
createdAt: '2026-01-07T18:32:38Z'
updatedAt: '2026-01-07T18:50:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8391'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T18:41:01Z'
---
# Update generateSeoFiles.mjs to handle tree-structured release data

The `apps/portal/resources/data/releases.json` structure was recently refactored from a simple flat list to a flat-tree structure (including parent nodes for major versions) to support the Portal's `TreeList` component.

The `buildScripts/generateSeoFiles.mjs` script, specifically the `getLlmsTxt` function, consumes this JSON to generate the "Latest Updates" section. Currently, it iterates over the array without filtering, which causes it to process the new parent nodes (e.g., "v11") as if they were release notes. Since these parent nodes lack the `version`, `date`, and `title` properties of actual release objects, this results in malformed entries or errors.

**Task:**
Update `buildScripts/generateSeoFiles.mjs` to filter the `releases` array. It should exclude nodes where `isLeaf` is explicitly `false` (or check for the existence of the `version` property) before slicing the top 5 items for the SEO content.

**Affected File:**
*   `buildScripts/generateSeoFiles.mjs`


## Timeline

- 2026-01-07T18:32:39Z @tobiu added the `bug` label
- 2026-01-07T18:32:39Z @tobiu added the `documentation` label
- 2026-01-07T18:32:39Z @tobiu added the `build` label
- 2026-01-07T18:33:41Z @tobiu assigned to @tobiu
- 2026-01-07T18:40:53Z @tobiu referenced in commit `3f0e48f` - "fix(build): Filter release tree nodes in SEO generation (#8391)

Update generateSeoFiles.mjs to exclude parent directory nodes (e.g. 'v11') from the Latest Updates section in llms.txt, ensuring only valid release items are processed."
- 2026-01-07T18:41:01Z @tobiu closed this issue
### @tobiu - 2026-01-07T18:50:40Z

**Input from Gemini 3 Pro:**

> ✦ Task completed.
> 
> Updated `buildScripts/generateSeoFiles.mjs` to filter out directory nodes (parent items without a version) from the release data. This ensures the `llms.txt` generation works correctly with the new tree-structured `releases.json`.


