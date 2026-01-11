---
id: 7147
title: Refactor `render` to `initVnode` and `createTemplateVdom` to `render`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T19:20:04Z'
updatedAt: '2025-07-31T19:20:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7147'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-31T19:20:35Z'
---
# Refactor `render` to `initVnode` and `createTemplateVdom` to `render`

**Description:**
To improve the developer experience for those familiar with React, a major refactoring was undertaken. The framework's core `render()` method was renamed to `initVnode()` to more accurately reflect its purpose of creating the initial VNode and mounting the component. This freed up the `render` name, allowing `createTemplateVdom()` to be renamed to `render()`, providing a more intuitive and familiar API for functional components using HTML templates. This change also included renaming the `rendered` property to `vnodeInitialized`, the `autoRender` config to `autoInitVnode`, and the `rendering` flag to `isVnodeInitializing` to maintain semantic consistency throughout the framework.

## Timeline

- 2025-07-31T19:20:04Z @tobiu assigned to @tobiu
- 2025-07-31T19:20:05Z @tobiu added the `enhancement` label
- 2025-07-31T19:20:05Z @tobiu added parent issue #7130
- 2025-07-31T19:20:31Z @tobiu referenced in commit `1dced6c` - "Refactor render to initVnode and createTemplateVdom to render
#7147"
- 2025-07-31T19:20:35Z @tobiu closed this issue

