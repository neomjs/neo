---
id: 6034
title: Scroll Dead end
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-10-17T07:12:48Z'
updatedAt: '2024-10-22T11:08:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6034'
author: uditjainstjis
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-22T11:08:15Z'
---
# Scroll Dead end


On site there are two code snippet boxes, when we scroll through website scrolling is working fine, but when our mouse is in code canvas area which is very big webpage doesn't scroll, (this is because when mouse gets inside code canvas it can now scroll code snippet lines only which is the bug, when no much lines of code is present such that scroll is needed it is still changing scroll from webpage to canvas)

and this will stuck users as a dead end due to glitch.

I am already working on this, can you pls assign me this project and add hacktoberfest tag if possible, thanks.
[https://drive.google.com/file/d/1qXOt-sgG2hV6FdJ2w5E2HE6qgfQj4n6v/view?usp=sharing](url)

## Timeline

- 2024-10-17T07:12:48Z @uditjainstjis added the `bug` label
### @tobiu - 2024-10-17T10:15:22Z

hi @uditjainstjis,

the "code snippets" are a wrapper component for the monaco editor (same engine as in VSCode). By default, scroll events get stopped to keep the "IDE box" at the same spot. I just googled for it and there is a 1-liner config to change it:
https://github.com/microsoft/monaco-editor/issues/1853#issuecomment-593484147

We can just drop this one into the component class as the default value, to ensure that the component behaves the same way inside all spots (e.g. learning section).

i can push a quick PoC to demonstrate it. i guess you would need a new ticket for the hacktoberfest then though.

best regards,
tobias

- 2024-10-17T10:16:28Z @tobiu referenced in commit `620d17e` - "#6034 component.wrapper.MonacoEditor: added scrollbar: {alwaysConsumeMouseWheel: false} as a default option"
### @tobiu - 2024-10-22T11:08:15Z

the fix is already deployed to the website.

- 2024-10-22T11:08:15Z @tobiu closed this issue

