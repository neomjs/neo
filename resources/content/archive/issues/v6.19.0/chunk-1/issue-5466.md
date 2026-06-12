---
id: 5466
title: 'Portal.view.home.parts.Helix: the 3d engine (transform-style: preserve 3d;) sometimes manages to break out of their scope'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-06-23T17:41:58Z'
updatedAt: '2024-07-16T12:44:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5466'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-16T12:44:58Z'
---
# Portal.view.home.parts.Helix: the 3d engine (transform-style: preserve 3d;) sometimes manages to break out of their scope

@maxrahder @ExtAnimal 

if i recall it correctly, we already had something similar with the helix inside the covid app.
![Screenshot 2024-06-23 at 19 35 23](https://github.com/neomjs/neo/assets/1177434/b1e2b158-f90b-427d-aed7-de81089ab67a)

inside the LivePreview, the DOM is deeply(!) nested:
![Screenshot 2024-06-23 at 19 39 42](https://github.com/neomjs/neo/assets/1177434/4d7e1d0f-18dd-4e30-b651-599d2ae26e46)

i think we need to at least use a div with `position: relative;` and `overflow: hidden;` for the preview and inside a wrapper div with `position: absolute;` filling the full space. less reflows and scoping are crucial here.

thoughts?

## Timeline

- 2024-06-23T17:41:59Z @tobiu added the `bug` label
- 2024-06-23T17:41:59Z @tobiu assigned to @tobiu
### @tobiu - 2024-07-16T12:44:59Z

already fixed.

- 2024-07-16T12:44:59Z @tobiu closed this issue

