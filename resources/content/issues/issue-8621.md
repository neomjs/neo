---
id: 8621
title: 'Investigation: FocusManager Stability during Atomic Moves'
state: OPEN
labels:
  - discussion
  - ai
  - testing
  - core
assignees: []
createdAt: '2026-01-13T22:08:35Z'
updatedAt: '2026-01-13T22:08:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8621'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigation: FocusManager Stability during Atomic Moves

The current "atomic move" implementation for `Neo.container.Base` involves a `remove` (silent) -> `insert` sequence. On the main thread, this translates to an `insertBefore` operation. In Chromium/WebKit, this causes the moved element to lose focus temporarily.

We currently patch this in `DeltaUpdates.moveNode` by immediately calling `focus()` on the element if it was active. This results in a rapid `focusout` -> `focusin` event sequence sent to the App Worker.

**Goal:**
Investigate if this event flicker causes unwanted side effects, particularly for:
1.  `Neo.form.field.Base` validation logic (often triggered on blur).
2.  `Neo.manager.Focus` state tracking.

**Potential Solution:**
If side effects are found, implement a "debounce" or "flicker detection" logic in `FocusManager` or `DeltaUpdates`. For example: "If an element loses focus, but re-gains it within X ms without another element taking focus in between, treat it as a continuous focus session."


## Timeline

- 2026-01-13T22:08:36Z @tobiu added the `discussion` label
- 2026-01-13T22:08:36Z @tobiu added the `ai` label
- 2026-01-13T22:08:36Z @tobiu added the `testing` label
- 2026-01-13T22:08:37Z @tobiu added the `core` label

