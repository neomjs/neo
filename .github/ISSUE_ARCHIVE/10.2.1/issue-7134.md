---
id: 7134
title: 'Regression: Layout `ntype` lost in lazy-loaded tabs'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-30T12:11:08Z'
updatedAt: '2025-07-30T12:15:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7134'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-30T12:15:44Z'
---
# Regression: Layout `ntype` lost in lazy-loaded tabs

**Reported by:** @tobiu on 2025-07-30

**Problem:**
A regression was discovered in `tab.Container` when using lazy-loaded tabs, as seen in the Covid app. When switching between un-initialized tabs, the second tab to be rendered would fail with the error: `Error: Class defined with object configuration missing ntype property.`

**Root Cause:**
The issue was a classic mutation-by-reference bug. The `onConstructed` method in `container.Base` was processing the `layout` config object. If this config came from a shared prototype (e.g., `Panel.config._layout`), the processing logic (specifically `createLayout` and `ntype`) would modify the original object on the prototype.

When the first lazy-loaded tab (a `Panel`) was created, it mutated the shared layout config. When the second lazy-loaded tab was created, it received this already-mutated object, which no longer had the `ntype` property, leading to the crash.

**Solution:**
The fix was implemented in `src/container/Base.mjs` inside the `onConstructed` method.

1.  The initial fix involved a simple shallow clone of the layout config.
2.  This was refined to be more robust: The logic now checks if `this.layout` is already a layout instance. If it is a plain config object, it performs a deep clone (`Neo.clone(config, true, false)`), which creates a unique copy for the instance while preserving any nested Neo instances within the config. This prevents the shared prototype config from being mutated.

This ensures that each container instance works with its own unique layout configuration, resolving the regression.

