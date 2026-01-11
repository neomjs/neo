---
id: 7769
title: Enhance SEO file generation to include all examples
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-13T21:33:49Z'
updatedAt: '2025-11-13T22:12:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7769'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T22:12:31Z'
---
# Enhance SEO file generation to include all examples

### Description

The current `buildScripts/generateSeoFiles.mjs` script generates a sitemap and `llms.txt` that cover the main application routes and the "learn" section. However, it omits the numerous examples available in the repository, which are a critical resource for users and for providing context to LLMs.

This epic is to enhance the script to automatically discover and include all relevant examples by scanning the `apps/` and `examples/` directories.

### Acceptance Criteria

1.  **File-based Discovery:** The script must recursively scan the `apps/` and `examples/` directories to find all `index.html` files, treating each as a discoverable example.
2.  **URL Generation:** The path to each discovered `index.html` should be converted into a relative URL.
3.  **Sitemap Integration:** All discovered example URLs must be included in the generated `dist/sitemap.xml`.
4.  **llms.txt Integration:** All discovered example URLs must be included in the generated `apps/portal/llms.txt`. A descriptive name should be generated from the file path for each example.
5.  **Exclusions**: The file-based discovery should not include examples from `node_modules` or other irrelevant directories.

### Implementation Suggestions

1.  **Create `collectExampleRoutes()`:** Create a new function within `buildScripts/generateSeoFiles.mjs` named `collectExampleRoutes`. This function will encapsulate the logic for finding all example routes.
2.  **Integrate into `collectAllRoutes()`:** Modify the existing `collectAllRoutes` function to call `collectExampleRoutes` and merge its results with the top-level and content routes.
3.  **File Scanning:** Use a glob pattern like `{apps,examples}/**/index.html` to find all example entry points. For each file found, create a route object.
4.  **Update `getLlmsTxt`:** The `getLlmsTxt` function will need to be updated to handle the new example routes, possibly creating a new "Examples" section in the output.

## Timeline

- 2025-11-13T21:33:51Z @tobiu added the `enhancement` label
- 2025-11-13T21:33:51Z @tobiu added the `epic` label
- 2025-11-13T21:33:51Z @tobiu added the `ai` label
- 2025-11-13T21:34:31Z @tobiu assigned to @tobiu
- 2025-11-13T21:34:43Z @tobiu removed the `epic` label
- 2025-11-13T21:36:54Z @tobiu changed title from **Epic: Enhance SEO file generation to include all examples** to **Enhance SEO file generation to include all examples**
- 2025-11-13T22:12:19Z @tobiu referenced in commit `24d8cbb` - "Enhance SEO file generation to include all examples #7769"
- 2025-11-13T22:12:31Z @tobiu closed this issue

