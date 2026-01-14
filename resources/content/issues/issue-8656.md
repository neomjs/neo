---
id: 8656
title: 'Refactor HeaderCanvas: ComponentManager, SCSS, and JSDoc'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-01-14T23:12:41Z'
updatedAt: '2026-01-14T23:12:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8656'
author: tobiu
commentsCount: 0
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor HeaderCanvas: ComponentManager, SCSS, and JSDoc

We refactored `apps/portal/view/HeaderCanvas.mjs` to improve code quality and documentation.

Changes:
- **Refactoring:** Replaced the nested `findButtons` helper with `ComponentManager.down(parent, 'button', false)` for cleaner, more robust component retrieval.
- **Styling:** Moved inline styles to a new SCSS file: `resources/scss/src/apps/portal/HeaderCanvas.scss` and applied the `portal-header-canvas` class.
- **Documentation:** Enhanced JSDoc for both `Portal.view.HeaderCanvas` and `Portal.canvas.HeaderCanvas` to clearly explain the App Worker <-> Shared Worker architecture and the "Luminous Flux" visual engine.
- **Cross-Referencing:** Added `@see` links to cross-reference the view and canvas components.
- **Cleanup:** Removed internal thought-process comments.


## Timeline

- 2026-01-14T23:12:43Z @tobiu added the `enhancement` label
- 2026-01-14T23:12:44Z @tobiu added the `ai` label
- 2026-01-14T23:12:50Z @tobiu added parent issue #8630

