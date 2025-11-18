---
id: 7791
title: Refactor ContentComponent to use new highlight.js utilities
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-18T10:13:12Z'
updatedAt: '2025-11-18T10:13:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7791'
author: tobiu
commentsCount: 0
parentIssue: 7788
subIssues:
  - 7789
  - 7790
subIssuesCompleted: 0
subIssuesTotal: 2
blockedBy: []
blocking: []
---
# Refactor ContentComponent to use new highlight.js utilities

With the creation of a universal `highlight.js` bundle (#7790) and a `HighlightJsLineNumbers` utility (#7789), we can now refactor `Portal.view.learn.ContentComponent` to use this new, unified, and synchronous approach.

This will remove the dependency on the main thread addon for highlighting and simplify the component's logic.

## Plan

1.  Once #7790 and #7789 are complete, refactor `ContentComponent.mjs`.
2.  Remove all usages of `Neo.main.addon.HighlightJS`.
3.  Import the new `Neo.util.Highlight` and `Neo.util.HighlightJsLineNumbers` utilities.
4.  Change the `processReadonlyCodeBlocks` method to be synchronous, using the new utilities to process code blocks.
5.  Create a new SCSS file `resources/scss/src/util/Highlight.scss`.
6.  Move the styles from `apps/portal/resources/lib/highlightjs-custom-github-theme.css` and the line number styles into this new file.
7.  Ensure the new SCSS file is imported and used by the portal application.
8.  Remove the old CSS files (`highlightjs-custom-github-theme.css`, `highlightjs-custom-dark-theme.css`). The dark theme can be re-added later if needed, using SCSS variables.

## Activity Log

- 2025-11-18 @tobiu added the `enhancement` label
- 2025-11-18 @tobiu added the `ai` label
- 2025-11-18 @tobiu added the `refactoring` label

