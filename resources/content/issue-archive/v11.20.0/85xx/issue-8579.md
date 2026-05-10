---
id: 8579
title: Fix ListModel keyboard navigation for trees and filtered lists
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-12T07:03:01Z'
updatedAt: '2026-01-12T07:07:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8579'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T07:07:37Z'
---
# Fix ListModel keyboard navigation for trees and filtered lists

The `Navigator` addon calculates `activeIndex` based on the current DOM state.
For `Neo.tree.List`, collapsed nodes are removed from the DOM (`removeDom: true`), causing the DOM item count to be smaller than the Store item count.
This causes `ListModel.onListNavigate` to retrieve the wrong record when using `store.getAt(data.activeIndex)`.
The fix is to use `data.activeItem` (the DOM ID) to look up the record, which is robust against DOM/Store mismatches.


## Timeline

- 2026-01-12T07:03:02Z @tobiu added the `bug` label
- 2026-01-12T07:03:02Z @tobiu added the `ai` label
### @tobiu - 2026-01-12T07:07:19Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `Neo.selection.ListModel.onListNavigate` to prioritize record lookup via the `activeItem`'s DOM ID. 
> 
> This ensures that keyboard navigation correctly identifies the underlying record even when the DOM structure differs from the flat store (e.g., in `Neo.tree.List` with collapsed nodes or future buffered lists). The previous index-based lookup is retained as a fallback.
> 
> The fix is generic and benefits all lists inheriting from `ListModel`.

- 2026-01-12T07:07:25Z @tobiu assigned to @tobiu
- 2026-01-12T07:07:37Z @tobiu closed this issue

