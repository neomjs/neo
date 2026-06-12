---
id: 5273
title: 'list.Base: focus outlines are getting cut off'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-02-29T10:10:06Z'
updatedAt: '2024-02-29T12:01:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5273'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-29T10:19:52Z'
---
# list.Base: focus outlines are getting cut off

@ExtAnimal @mxmrtns 

<img width="515" alt="Screenshot 2024-02-29 at 11 04 56" src="https://github.com/neomjs/neo/assets/1177434/8025b35c-bcf6-4421-9e7b-5de974d28e04">

the easiest solution for now is using `outline-offset: -1px;`.

we can create a follow-up ticket to discuss about other options (like removing `overflow: hidden`). however, this would be expensive regarding browser reflow OPs.

## Timeline

- 2024-02-29T10:10:06Z @tobiu added the `bug` label
- 2024-02-29T10:10:06Z @tobiu assigned to @tobiu
- 2024-02-29T10:18:40Z @tobiu referenced in commit `22d8a2f` - "list.Base: focus outlines are getting cut off #5273"
### @tobiu - 2024-02-29T10:19:52Z

added a new theme var to make it configurable: `--list-item-focus-outline-offset`

<img width="449" alt="Screenshot 2024-02-29 at 11 19 36" src="https://github.com/neomjs/neo/assets/1177434/98b5cbd4-32cb-4121-a265-916a01fabc17">


- 2024-02-29T10:19:52Z @tobiu closed this issue
### @mxmrtns - 2024-02-29T12:01:29Z

@tobiu This feels very much like a hack to me. I would rather add a padding with focus-outline-width. 
On the other hand can you put a number to what are the implications if we would get rid of overflow hidden? Like in ms?

- 2024-03-26T16:29:36Z @tobiu referenced in commit `62969db` - "list.Base: focus outlines are getting cut off #5273"

