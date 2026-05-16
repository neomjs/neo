---
id: 8627
title: 'Fragment hidden config fails: removeNode delta missing parentId'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-14T00:48:26Z'
updatedAt: '2026-01-14T00:49:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8627'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T00:49:58Z'
---
# Fragment hidden config fails: removeNode delta missing parentId

The `hidden` config on a `Neo.container.Fragment` (which sets `removeDom: true` on the VDOM node) fails to remove the Fragment from the DOM.

**Root Cause:**
`Neo.vdom.Helper.removeNode` only includes the `parentId` in the delta for `vtype: 'text'` nodes. However, `Neo.main.DeltaUpdates.removeNode` requires `parentId` to locate and remove Fragments (since they consist of start/end comment anchors and don't have a single element ID to look up).

**Symptoms:**
- Setting `hidden: true` on a Fragment does nothing (DOM remains).
- Setting `hidden: false` afterwards causes duplication (new content inserted, old content remains).

**Fix:**
Update `Neo.vdom.Helper.removeNode` to include `parentId` in the delta if the node is a Fragment (`nodeName === 'fragment'`).

## Timeline

- 2026-01-14T00:48:27Z @tobiu added the `bug` label
- 2026-01-14T00:48:27Z @tobiu added the `ai` label
- 2026-01-14T00:48:27Z @tobiu added the `core` label
- 2026-01-14T00:49:15Z @tobiu added parent issue #8601
- 2026-01-14T00:49:29Z @tobiu referenced in commit `b790098` - "fix(VDOM): Include parentId in removeNode delta for Fragments (#8627)"
- 2026-01-14T00:49:33Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T00:49:40Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the issue where `Neo.container.Fragment` `hidden: true` config would fail to remove the DOM nodes.
> 
> **Fix Details:**
> - **File:** `src/vdom/Helper.mjs`
> - **Change:** Updated `removeNode` to include the `parentId` in the delta when the node is a Fragment (`nodeName === 'fragment'`). This allows `Neo.main.DeltaUpdates` to correctly locate the fragment anchors for removal.
> 
> **Verification:**
> - Created a new unit test `test/playwright/unit/vdom/FragmentHidden.spec.mjs` which verifies that the `removeNode` delta for a Fragment includes the `parentId` and that the subsequent `insertNode` delta is correct.
> 
> Changes committed and pushed.

- 2026-01-14T00:49:58Z @tobiu closed this issue
- 2026-01-14T00:51:25Z @tobiu cross-referenced by #8616
- 2026-01-14T00:59:06Z @tobiu cross-referenced by #8625

