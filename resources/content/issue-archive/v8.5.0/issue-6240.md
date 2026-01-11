---
id: 6240
title: 'learneo tutorial todoList:  VdomUtil.findVdomChild is not a function'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-15T14:54:30Z'
updatedAt: '2025-01-16T14:19:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6240'
author: gplanansky
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-16T14:18:46Z'
---
# learneo tutorial todoList:  VdomUtil.findVdomChild is not a function

`VM102:96 Uncaught TypeError: VdomUtil.findVdomChild is not a function`

fix  -> change to  just "find"  (see  e.g.`examples/todoList/version1/MainComponent.mjs`) :

```
$ pwd
.../neo/resources/data/deck/learnneo/pages/tutorials
$ diff TodoList.md TodoList.md.orig 
94c94
<             node   = VdomUtil.find(me.vdom, data.path[0].id).vdom;
---
>             node   = VdomUtil.findVdomChild(me.vdom, data.path[0].id).vdom;
```



## Timeline

- 2025-01-15T14:54:30Z @gplanansky added the `bug` label
### @gplanansky - 2025-01-15T15:02:03Z

Also:
```
$ pwd
.../neo

$ rg findVdomChild
resources/data/deck/training/pages/2023-02-05T17-44-53-815Z.md
80:    Neo.util.VDom.findVdomChild(view.vdom, 'title').vdom.innerHTML = business.title;
89:    findVdomChild = Neo.util.VDom.findVdomChild
94:findVdomChild = Neo.util.VDom.findVdomChild;
99:    this.findVdomChild(view.vdom, 'title').vdom.innerHTML = business.title;
132:    this.findVdomChild(view.vdom, 'thumbnail').vdom.src = business.imageUrl;
187:    this.findVdomChild(view.vdom, 'address').vdom.cn = business
```



- 2025-01-15T15:02:03Z @gplanansky closed this issue
### @tobiu - 2025-01-15T18:09:05Z

Hi George,

be careful with the Buttons in GitHub. When writing a comment, there is `Comment` and `Close with Comment`. I will re-open this ticket for you.

Do you want to send a PR or shall I fix it?

Best regards,
Tobi

- 2025-01-15T18:09:06Z @tobiu reopened this issue
- 2025-01-16T14:17:46Z @tobiu assigned to @tobiu
### @tobiu - 2025-01-16T14:18:02Z

i will grab it, to get it into the next release.

- 2025-01-16T14:18:20Z @tobiu referenced in commit `ec387cd` - "learneo tutorial todoList: VdomUtil.findVdomChild is not a function #6240"
### @gplanansky - 2025-01-16T14:18:29Z

ahh, I sought to close my comment, not the issue.  please fix thanks
I see you have even as I wrote this.


- 2025-01-16T14:18:46Z @tobiu closed this issue

