---
id: 6957
title: Introduce `Neo.core.Base#observeConfig()` for Lifecycle-Aware Config Subscriptions
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T00:23:54Z'
updatedAt: '2025-07-06T00:27:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6957'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-06T00:27:52Z'
---
# Introduce `Neo.core.Base#observeConfig()` for Lifecycle-Aware Config Subscriptions

**Problem:**
Manually managing `Neo.core.Config` subscriptions within `Neo.core.Base` instances is error-prone. Developers must remember to explicitly unsubscribe, leading to potential memory leaks if cleanup is missed.

**Solution:**
Add a new public method `observeConfig(publisher, configName, fn)` to `Neo.core.Base`. This method will:
1.  Accept a `publisher` (instance or ID), a `configName` (string), and a callback `fn`.
2.  Internally resolve the `publisher` to an instance.
3.  Retrieve the `Neo.core.Config` controller for the specified `configName` on the `publisher`.
4.  Call `Neo.core.Config#subscribe` using `this.id` (the subscribing `Base` instance's ID) as the subscription `id`.
5.  Store the returned cleanup function in a new private array (`#configSubscriptionCleanups`) on `this` (the subscribing `Base` instance).
6.  Integrate the cleanup of `#configSubscriptionCleanups` into `Neo.core.Base#destroy()`, ensuring automatic unsubscription.

**Benefits:**
*   **Automatic Memory Leak Prevention:** Subscriptions are automatically cleaned up when the subscribing `Base` instance is destroyed, eliminating a common source of leaks.
*   **Simplified Developer Experience:** Provides a single, intuitive, and consistent API for subscribing to configs on other instances.
*   **Centralized Management:** Consolidates subscription logic within `Base`, reducing boilerplate and potential errors in subclasses.
*   **Discourages Self-Observation:** Includes a JSDoc warning example, guiding developers towards using `afterSet<ConfigName>()` hooks for internal reactions.

**Impact:**
Replaces direct calls to `Neo.core.Config#subscribe` in `Neo.core.Base` subclasses with the new `observeConfig` method.

## Timeline

- 2025-07-06T00:23:54Z @tobiu assigned to @tobiu
- 2025-07-06T00:23:56Z @tobiu added the `enhancement` label
- 2025-07-06T00:25:58Z @tobiu referenced in commit `b2c2e3f` - "Introduce Neo.core.Base#observeConfig() for Lifecycle-Aware Config Subscriptions #6957"
- 2025-07-06T00:27:52Z @tobiu closed this issue
- 2025-07-06T00:40:00Z @tobiu cross-referenced by #6958

