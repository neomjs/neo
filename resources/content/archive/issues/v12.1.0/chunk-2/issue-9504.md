---
id: 9504
title: 'List: Fix vertical scrollbar visibility and contrast'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-17T19:25:43Z'
updatedAt: '2026-03-17T19:27:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9504'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-17T19:27:54Z'
---
# List: Fix vertical scrollbar visibility and contrast

**Problem:**
1. In `Portal.view.examples.List` (and other lists using `useWrapperNode`), the vertical scrollbar was getting pushed outside the visible area if the wrapper had padding. This occurred because `.neo-list.neo-use-wrapper-node` used `position: absolute; width: 100%; height: 100%;`, which expands to the wrapper's padding box size but starts at the static position (inside the padding), causing an overflow on the right/bottom.
2. The scrollbar was not aware of the background color context, causing poor contrast in dark themes.

**Solution:**
1. Replaced `width: 100%; height: 100%;` with `inset: 0;` in `src/list/Base.scss` for `.neo-use-wrapper-node`. This forces the list to exactly match the padding edge of the wrapper without overflowing.
2. Introduced the `--list-scrollbar-color-scheme` CSS variable in all themes (dark/light) and applied it via `color-scheme` on `.neo-list` to ensure native scrollbars have the correct contrast against the background.

## Timeline

- 2026-03-17T19:25:43Z @tobiu assigned to @tobiu
- 2026-03-17T19:25:44Z @tobiu added the `bug` label
- 2026-03-17T19:25:44Z @tobiu added the `ai` label
- 2026-03-17T19:27:08Z @tobiu referenced in commit `e031130` - "style(list): Fix vertical scrollbar visibility and contrast (#9504)"
### @tobiu - 2026-03-17T19:27:53Z

Fixed via e03113020.

- 2026-03-17T19:27:54Z @tobiu closed this issue

