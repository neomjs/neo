---
id: 6905
title: 'Enhance Mixin System: Automatically Merge static config from Mixins'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-30T01:21:29Z'
updatedAt: '2025-10-22T22:56:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6905'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-08T21:04:15Z'
---
# Enhance Mixin System: Automatically Merge static config from Mixins

Currently, the Neo.mjs mixin system, implemented via `applyMixins` in `src/Neo.mjs`, effectively copies methods from mixins to the target class's prototype. However, it does not automatically merge the `static config` properties defined within mixins into the `static config` of the class that consumes them.

This behavior means that default configuration values or new configurable properties introduced by a mixin are not automatically inherited by the consuming class. Developers are required to manually replicate or merge these configurations, which introduces boilerplate, increases the risk of errors, and diminishes the "plug-and-play" benefit of mixins for configuration.

**Proposed Enhancement:**

Modify the `applyMixins` function (or the `Neo.setupClass` process where mixins are applied) to intelligently merge the `static config` of each applied mixin into the `static config` of the target class. This merge should respect the inheritance hierarchy, allowing the consuming class's own `static config` to override mixin configs, and later mixins to override earlier ones (or a defined merge strategy).

**Benefits:**

 *   **Reduced Boilerplate**: Eliminates the need for manual config merging in consuming classes.
*   **Improved Maintainability**: Configuration defaults and new configurable properties introduced by mixins are automatically applied.
*   **Enhanced Developer Experience**: Mixins become more powerful and intuitive for sharing not just behavior, but also configurable state.
*   **Consistency**: Aligns the mixin system more closely with the declarative nature of Neo.mjs's config system.

## Timeline

- 2025-06-30T01:21:30Z @tobiu added the `enhancement` label
- 2025-07-08T13:14:11Z @tobiu referenced in commit `1a4bbfb` - "Enhance Mixin System: Automatically Merge static config from Mixins #6905 exploration inside a new feature branch"
- 2025-07-08T14:18:09Z @tobiu referenced in commit `31c60d2` - "#6905 exploration WIP"
- 2025-07-08T19:05:13Z @tobiu referenced in commit `3bf40d4` - "#6905 Added test testing class into the current feature branch, to not lose it."
- 2025-07-08T20:44:56Z @tobiu referenced in commit `8fc891c` - "Enhance Mixin System: Automatically Merge static config from Mixins #6905"
### @tobiu - 2025-07-08T21:04:15Z

<img width="945" height="303" alt="Image" src="https://github.com/user-attachments/assets/b72d102e-f596-4cbf-84cb-96a51960f99a" />

- 2025-07-08T21:04:15Z @tobiu closed this issue
- 2025-07-09T00:10:52Z @tobiu referenced in commit `3e475e6` - "#6905 Added test testing class into the current feature branch, to not lose it."
- 2025-07-09T00:10:52Z @tobiu referenced in commit `9feb51e` - "Enhance Mixin System: Automatically Merge static config from Mixins #6905"

