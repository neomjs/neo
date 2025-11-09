---
id: 7008
title: >-
  Update the State Providers guide to reflect effects-based reactivity and
  direct store binding
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-10T20:21:06Z'
updatedAt: '2025-07-10T20:23:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7008'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-10T20:23:45Z'
---
# Update the State Providers guide to reflect effects-based reactivity and direct store binding

**Reported by:** @tobiu on 2025-07-10

## Description

The `StateProviders.md` guide has been updated to provide a more accurate and comprehensive explanation of how Neo.mjs State Providers implement reactivity, as well as to demonstrate the new capability of directly binding to `Neo.data.Store` properties.

## Changes Made

*   Added a new section "How Reactivity Works: The Effects-Based System" to explain `Neo.core.Effect` and the hierarchical data proxy.
*   Updated the "Managing Stores with State Providers" example to remove the intermediate `myStoreCount` data property and `onMyStoreCountChange` listener.
*   Modified the `Label` binding in the store example to directly reference `data.stores.mySharedStore.count`.

## Verification

Confirmed that the updated example in `learn/guides/datahandling/StateProviders.md` functions as expected, demonstrating direct reactive binding to store properties.

