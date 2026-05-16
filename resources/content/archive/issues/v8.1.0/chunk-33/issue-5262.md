---
id: 5262
title: Obsolete css class in secondary button
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2024-02-23T09:16:07Z'
updatedAt: '2024-09-12T02:28:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5262'
author: mxmrtns
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:15Z'
---
# Obsolete css class in secondary button

Is this class obsolete? I couldn't figure out what it does as we also have a :active class, which should cover the use case of 'pressed'

https://github.com/neomjs/neo/blob/f5f8bfce6f6daa95c1c77eda8b41bd414dc71225/resources/scss/src/button/Base.scss#L257C1-L259C10

## Timeline

- 2024-02-23T09:16:08Z @mxmrtns added the `bug` label
- 2024-02-23T09:16:12Z @mxmrtns assigned to @mxmrtns
- 2024-02-23T09:16:22Z @mxmrtns assigned to @tobiu
- 2024-02-23T09:16:22Z @mxmrtns unassigned from @mxmrtns
### @tobiu - 2024-02-23T09:25:20Z

Hi Max,

i think we need both, active & pressed states.

one state indicates a mousedown or tap event, the other one indicates an active item.

think of tab header buttons (active tab) or button toggle groups, where one button can be pressed to indicate a navigation state.

@ExtAnimal 

### @mxmrtns - 2024-02-23T09:28:41Z

I don't see how there is a difference. :active = mousedown / tap or not?

@tobiu @ExtAnimal 

### @tobiu - 2024-02-23T09:35:59Z

take a look at this one: http://localhost:8080/examples/tab/container/

the "selected" tab header looks different inside the dark theme. a click triggers the ripple effect, but it could just be a different css rule.

### @mxmrtns - 2024-02-23T09:57:15Z

I think I know what you mean and I think we need to align on some semantics

**:active** pseudo-class represents an element (such as a button) that is being activated by the user. When using a mouse, "activation" typically starts when the user presses down the primary mouse button. (from mdn docs)

**pressed** is no actual HTML state and just means the same as :active

**selected** is what you are referring to in your Tab-Header button. Also it is just a semantic state and not actual HTML

 **:focus** pseudo-class represents an element (such as a form input) that has received focus. It is generally triggered when the user clicks or taps on an element or selects it with the keyboard's Tab key. (from mdn docs)

From my perspective a regular button ...
... can be active (which is the equivalent to being pressed)
... can be focused
**... cannot be selected**

@tobiu @ExtAnimal 


### @github-actions - 2024-08-29T02:25:37Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:37Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:15Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:15Z @github-actions closed this issue

