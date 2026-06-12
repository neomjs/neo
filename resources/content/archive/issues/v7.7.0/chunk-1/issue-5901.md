---
id: 5901
title: 7.3.0 release   examples/dialog <Esc> does not hide dialog after dialog is dragged
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-09-14T05:54:39Z'
updatedAt: '2024-09-20T13:40:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5901'
author: gplanansky
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-20T13:38:54Z'
---
# 7.3.0 release   examples/dialog <Esc> does not hide dialog after dialog is dragged

**Describe the bug**
examples/dialog  <Esc> does not hide dialog after mouse click on dialog, or, dialog moved

**To Reproduce**
git clone,  cd neo, npi i, npm run build-all, npm run server-start
chrome:   run examples/dialog

1. works:
reload
click create dialog button   --> dialog appears
\<Esc\>   --> dialog hides 

2. not works:
reload
click create dialog button   --> dialog appears
click or drag dialog
\<Esc \>  -->  dialog unchanged 

**Expected behavior**
the (1) works case above

**Desktop (please complete the following information):**
 - OS: macos 15.6
 - Browser  Chrome Version 128.0.6613.138 (Official Build) (arm64)



## Timeline

- 2024-09-14T05:54:39Z @gplanansky added the `bug` label
- 2024-09-14T11:12:56Z @tobiu assigned to @tobiu
- 2024-09-14T11:14:41Z @tobiu referenced in commit `85e6087` - "#5901 quick fix"
- 2024-09-20T13:38:47Z @tobiu referenced in commit `fded428` - "#5901 43-focussing a dialog after a resize OP"
- 2024-09-20T13:38:54Z @tobiu closed this issue
### @tobiu - 2024-09-20T13:40:11Z

typing too fast. "re-focussing" should have been the commit message title^^

since we now re-apply the focus after drag & resize OPs, the ticket is resolved.


