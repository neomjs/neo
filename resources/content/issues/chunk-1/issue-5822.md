---
id: 5822
title: 'main.addon.MonacoEditor: remove editor/editor.main.nls.js'
state: OPEN
labels:
  - bug
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2024-08-26T18:35:11Z'
updatedAt: '2024-08-27T20:40:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5822'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# main.addon.MonacoEditor: remove editor/editor.main.nls.js

i upgraded to v0.51.0, and was missing that the setup changed.

the breaking change was not mentioned inside the release notes:
https://github.com/microsoft/monaco-editor/releases/tag/v0.51.0

i found it here:
https://github.com/microsoft/monaco-editor/commit/e52ff427290808dff6809b3f77866ae7a62a119b

## Timeline

- 2024-08-26T18:35:11Z @tobiu added the `enhancement` label
- 2024-08-26T18:35:11Z @tobiu assigned to @tobiu
- 2024-08-26T18:42:49Z @tobiu added the `bug` label
### @tobiu - 2024-08-26T18:44:54Z

tried it out with removing the file, and it is causing serious damage:
![Screenshot 2024-08-26 at 20 41 32](https://github.com/user-attachments/assets/cd567936-6100-4026-bd58-d432694ffe87)

i will switch back to the previous version and create a bug ticket for microsoft.

- 2024-08-26T18:50:41Z @tobiu cross-referenced by #4654
- 2024-08-26T18:52:59Z @tobiu referenced in commit `97c9ffb` - "#5822 switching back to the last stable monaco-editor version for now"
- 2024-08-27T20:40:37Z @tobiu added the `no auto close` label

