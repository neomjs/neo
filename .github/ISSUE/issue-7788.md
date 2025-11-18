---
id: 7788
title: Create a node-compatible highlight.js utility for SSR
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-18T09:24:44Z'
updatedAt: '2025-11-18T09:44:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7788'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 7791
subIssuesCompleted: 0
subIssuesTotal: 1
blockedBy: []
blocking: []
---
# Create a node-compatible highlight.js utility for SSR

We are building a new SSR middleware for neo.mjs that will render components to HTML on the server.

The current implementation for highlighting code blocks relies on a main-thread addon (`src/main/addon/HighlightJS.mjs`), which is not available in a Node.js environment.

We need to create a server-side utility that uses `highlight.js` to parse and highlight code blocks within our markdown-to-HTML conversion process.

## Acceptance Criteria

1.  Create a new utility module, e.g., `src/util/HighlightJS.mjs` or similar.
2.  This module should import `highlight.js` and expose a `highlightAuto` method that takes a code string and returns the highlighted HTML.
3.  The implementation should be compatible with a Node.js environment.
4.  The new SSR middleware will use this utility to process markdown content.
5.  The existing `apps/portal/view/learn/ContentComponent.mjs` will remain unchanged and continue to use the main-thread addon for client-side rendering.

## Research

- `highlight.js` can be used in Node.js by installing it via npm (`npm install highlight.js`).
- It can be imported using `import hljs from 'highlight.js';`.
- The `hljs.highlightAuto(code).value` method can be used to get the highlighted HTML.

## Activity Log

- 2025-11-18 @tobiu added the `enhancement` label
- 2025-11-18 @tobiu added the `ai` label
- 2025-11-18 @tobiu cross-referenced by #7789
- 2025-11-18 @tobiu assigned to @tobiu

