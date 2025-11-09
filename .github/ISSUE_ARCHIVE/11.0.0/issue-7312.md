---
id: 7312
title: Fix Prototype Pollution in Neo.setupClass
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-09-30T12:36:14Z'
updatedAt: '2025-09-30T12:37:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7312'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-30T12:37:20Z'
---
# Fix Prototype Pollution in Neo.setupClass

**Reported by:** @tobiu on 2025-09-30

This ticket addresses a framework bug discovered during the migration of unit tests to Playwright. Intermittent test failures pointed to a race condition caused by prototype pollution within the `Neo.setupClass` method in `src/Neo.mjs`.

### The Bug

The `setupClass` method was directly mutating the static `config` object of the class it was processing. While `setupClass` is gated to only run once per class, this direct mutation of a static property is unsafe in a parallel environment and caused race conditions between tests running in different workers.

### The Fix

The fix ensures that `setupClass` operates on a deep clone of the static `config` object and related `configDescriptors`, preventing any modification of the original class definition. This was achieved by:

1.  Changing `cfg = ctor.config || {};` to `cfg = ctor.config ? Neo.clone(ctor.config, true) : {};` to work on a clone.
2.  Introducing a local `currentConfigDescriptors` variable to prevent direct mutation of the static `ctor.configDescriptors` property during the build-up phase.

This change resolves the intermittent test failures and makes the class setup process more robust and safe for concurrent environments.

