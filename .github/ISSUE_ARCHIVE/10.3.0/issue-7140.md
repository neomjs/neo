---
id: 7140
title: Bundle `parse5` for Browser Compatibility
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T07:55:33Z'
updatedAt: '2025-07-31T08:01:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7140'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-31T08:01:32Z'
---
# Bundle `parse5` for Browser Compatibility

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
To adhere to the framework's "zero builds" development principle, the `parse5` library cannot be imported directly from `node_modules` at runtime. A build step is required to convert it into a browser-compatible ES module. This bundled file will be checked into the `dist` directory and imported by the `HtmlTemplateProcessor`.

**Implementation Details:**
- **Tool:** `esbuild`
- **Source:** `node_modules/parse5/dist/index.js`
- **Output:** `dist/parse5.mjs`
- **Script:** Create a new build script `buildScripts/bundleParse5.mjs` and an associated npm script `bundle-parse5` to perform the bundling and minification.
- **Outcome:** The `HtmlTemplateProcessor` will be updated to import `../../../dist/parse5.mjs`.

