---
id: 8139
title: Support saveScrollPosition in StringBasedRenderer
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-17T14:55:23Z'
updatedAt: '2025-12-17T15:48:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8139'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T15:48:26Z'
---
# Support saveScrollPosition in StringBasedRenderer

## Context
Ticket #8138 added support for `scrollTop` and `scrollLeft` in `DomApiRenderer` by queuing post-mount updates.
We need to support the same feature for `StringBasedRenderer` (used when `Neo.config.useDomApiRenderer` is false).
Since parsing HTML strings in the main thread to extract these properties is expensive, we will offload this work to the VDom worker.

## Problem
The current string generation logic in `Neo.vdom.util.StringFromVnode` only produces an HTML string. It ignores `scrollTop` and `scrollLeft` properties on VNodes, meaning scroll state is lost when mounting via `outerHTML`.

## Goal
Update the VDom-to-String generation process to produce a sidecar map of nodes requiring scroll updates, and update the renderer to apply them.

## Implementation Details

### 1. VDom Worker Side
- **`src/vdom/util/StringFromVnode.mjs`**:
    - Update `create()` to accept a `postMountUpdates` array (similar to the `movedNodes` map).
    - When processing a VNode, if it has `scrollTop` or `scrollLeft`, add an entry to `postMountUpdates`: `{id, scrollLeft, scrollTop}`.
- **`src/vdom/Helper.mjs`**:
    - Update `create()` method.
    - Initialize `postMountUpdates` array.
    - Pass it to `StringFromVnode.create()`.
    - Include `postMountUpdates` in the returned object if it has entries.
    - Update `insertNode` to include `postMountUpdates` in the delta object.

### 2. Main Thread Side
- **`src/main/DeltaUpdates.mjs`**:
    - Update `insertNode` to pass `postMountUpdates` to `StringBasedRenderer.insertNodeAsString`.
- **`src/main/render/StringBasedRenderer.mjs`**:
    - Update `insertNodeAsString` to accept `postMountUpdates`.
    - After inserting the HTML, iterate through `postMountUpdates` and apply the scroll values to the corresponding DOM nodes (lookup by ID).


## Timeline

- 2025-12-17T14:55:24Z @tobiu added the `enhancement` label
- 2025-12-17T14:55:24Z @tobiu added the `ai` label
- 2025-12-17T14:55:25Z @tobiu added the `core` label
- 2025-12-17T14:56:03Z @tobiu assigned to @tobiu
- 2025-12-17T15:16:25Z @tobiu referenced in commit `f255fdd` - "Support saveScrollPosition in StringBasedRenderer #8139"
- 2025-12-17T15:48:26Z @tobiu closed this issue

