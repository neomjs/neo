---
id: 7007
title: 'state.createHierarchicalDataProxy: Allow direct binding to store properties'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-10T20:18:32Z'
updatedAt: '2025-10-22T22:57:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7007'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-10T20:19:08Z'
---
# state.createHierarchicalDataProxy: Allow direct binding to store properties

**Reported by:** @tobiu on 2025-07-10

## Description

The `Neo.state.createHierarchicalDataProxy` has been enhanced to directly expose `Neo.data.Store` instances via the `data.stores` path. This allows developers to bind directly to properties of stores (e.g., `data.stores.myStore.count`) within `bind` configurations and `formulas` without needing intermediate data properties or listeners.

## Changes Made

*   Modified `src/state/createHierarchicalDataProxy.mjs` to include special handling for the `stores` property in the `get` trap.
*   When `data.stores` is accessed, a new proxy is returned that delegates to `Neo.state.Provider.getStore()` for hierarchical resolution of store instances.
*   This enables `Neo.core.Effect` to directly track changes to reactive configs (like `count`) on the returned `Neo.data.Store` instances.

## Verification

Verified that the example in `learn/guides/datahandling/StateProviders.md` now correctly binds directly to `data.stores.mySharedStore.count` and updates reactively when the store's count changes.

