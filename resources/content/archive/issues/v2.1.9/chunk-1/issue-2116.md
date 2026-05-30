---
id: 2116
title: Text field throws error when clearing field and typing
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-05-22T20:12:09Z'
updatedAt: '2021-05-23T10:38:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2116'
author: keckeroo
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-23T10:38:13Z'
---
# Text field throws error when clearing field and typing

**Describe the bug**
When initially set to have 'clearable' and then clearing 'clearable', text field generates errors when typing
This also affects textarea field too (understandable)

**To Reproduce**
Steps to reproduce the behavior:
1. Go to textfield demo 
2. UNCLICK the clearable box
3. type any character or delete 
4. See error
Clear.mjs:75 Uncaught TypeError: Cannot read property 'value' of null
    at Clear.getHiddenState (Clear.mjs:75)
    at Clear.onFieldChange (Clear.mjs:93)
    at Text.fire (Observable.mjs:112)
    at Text.afterSetValue (Base.mjs:33)
    at Text.afterSetValue (Text.mjs:485)
    at Text.set (Neo.mjs:544)
    at Text.onInputValueChange (Text.mjs:832)
    at DomEvent.mjs:113
    at Array.forEach (<anonymous>)
    at DomEvent.fire (DomEvent.mjs:98)

**Expected behavior**
expected to be able to type or delete characters in text field

![Screen Shot 2021-05-22 at 3 11 45 PM](https://user-images.githubusercontent.com/1653769/119239641-115b5080-bb10-11eb-928f-8cb0997e56b0.png)


## Timeline

- 2021-05-22T20:12:09Z @keckeroo added the `bug` label
- 2021-05-23T09:32:30Z @tobiu assigned to @tobiu
### @tobiu - 2021-05-23T09:32:45Z

confirmed. will take a look into it now.

- 2021-05-23T09:47:00Z @tobiu referenced in commit `aa9037d` - "Text field throws error when clearing field and typing #2116"
- 2021-05-23T10:36:57Z @tobiu cross-referenced by #2133
### @tobiu - 2021-05-23T10:38:13Z

this one works now, there are probably follow up tickets.

- 2021-05-23T10:38:13Z @tobiu closed this issue

