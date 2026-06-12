---
id: 5238
title: 'component.wrapper.MonacoEditor: onContentChange()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-02-18T20:31:04Z'
updatedAt: '2024-02-18T20:31:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5238'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-18T20:31:33Z'
---
# component.wrapper.MonacoEditor: onContentChange()

the main thread addon needs to pass content changes to the app worker, as a DOM based change event.

the wrapper cmp needs to subscribe to it and should also fire a custom change event.

@maxrahder 

## Timeline

- 2024-02-18T20:31:04Z @tobiu added the `enhancement` label
- 2024-02-18T20:31:04Z @tobiu assigned to @tobiu
- 2024-02-18T20:31:29Z @tobiu referenced in commit `e283330` - "component.wrapper.MonacoEditor: onContentChange() #5238"
- 2024-02-18T20:31:33Z @tobiu closed this issue
- 2024-03-26T16:29:32Z @tobiu referenced in commit `c45a68b` - "component.wrapper.MonacoEditor: onContentChange() #5238"

