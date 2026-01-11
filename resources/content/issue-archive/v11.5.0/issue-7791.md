---
id: 7791
title: Refactor ContentComponent to use new highlight.js utilities
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-18T10:13:12Z'
updatedAt: '2025-11-18T19:27:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7791'
author: tobiu
commentsCount: 0
parentIssue: 7788
subIssues:
  - '[x] 7789 Create a utility for highlight.js line numbers'
  - '[x] 7790 Create a universal ESM bundle for highlight.js'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2025-11-18T19:27:35Z'
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

## Timeline

- 2025-11-18T10:13:13Z @tobiu added the `enhancement` label
- 2025-11-18T10:13:13Z @tobiu added the `ai` label
- 2025-11-18T10:13:14Z @tobiu added the `refactoring` label
- 2025-11-18T10:13:37Z @tobiu added sub-issue #7789
- 2025-11-18T10:13:45Z @tobiu added sub-issue #7790
- 2025-11-18T10:13:59Z @tobiu added parent issue #7788
- 2025-11-18T10:16:31Z @tobiu cross-referenced by #7788
- 2025-11-18T10:23:27Z @tobiu assigned to @tobiu
- 2025-11-18T12:12:21Z @tobiu cross-referenced by #7790
- 2025-11-18T18:21:23Z @tobiu referenced in commit `8f1d7b7` - "Refactor ContentComponent to use new highlight.js utilities #7791 & added Neo.util.HighlightJs"
- 2025-11-18T18:45:47Z @tobiu referenced in commit `4d45226` - "#7791 theming"
- 2025-11-18T19:22:48Z @tobiu referenced in commit `5132316` - "#7791 portal app: removed custom hljs resources, using our new util class now"
- 2025-11-18T19:27:23Z @tobiu referenced in commit `b0edcaa` - "#7791 removed the highlightjs devDependency (not needed when cloning the repo)"
- 2025-11-18T19:27:35Z @tobiu closed this issue

