---
id: 5559
title: 'vdom.Helper: add support for a boolean static vdom / vnode property'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-11T16:31:47Z'
updatedAt: '2024-07-12T09:38:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5559'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-12T09:38:22Z'
---
# vdom.Helper: add support for a boolean static vdom / vnode property

simply put: flag a node / sub-tree as static to exclude it from `createDeltas()` calls.

## Timeline

- 2024-07-11T16:31:47Z @tobiu added the `enhancement` label
- 2024-07-11T16:31:47Z @tobiu assigned to @tobiu
- 2024-07-12T09:28:01Z @tobiu referenced in commit `4b28fa1` - "vdom.Helper: add support for a boolean static vdom / vnode property #5559"
### @tobiu - 2024-07-12T09:38:22Z

<img width="877" alt="Screenshot 2024-07-12 at 11 29 07" src="https://github.com/user-attachments/assets/101ae0b5-ec6c-44a1-9baf-2be1322ea826">

![Screenshot 2024-07-12 at 11 29 50](https://github.com/user-attachments/assets/2c3b32fa-3b7b-419d-b1a6-7c6cdf30ce64)

"real world" test (of course not pushed) => changing the vdom of a button:

```
{tag: 'button', type: 'button', cn: [
    {tag: 'span', cls: ['neo-button-glyph']},
    {tag: 'span', cls: ['neo-button-text'], static: true},
    {cls: ['neo-button-badge']},
    {cls: ['neo-button-ripple-wrapper'], cn: [
        {cls: ['neo-button-ripple']}
    ]}
]}
```

![Screenshot 2024-07-12 at 11 26 03](https://github.com/user-attachments/assets/7d186b0d-e65a-49f9-9efd-3aed61c4dcfe)

renders correctly, but can no longer get changed => excluded from delta updates.

```
<span class="neo-button-text" id="neo-vnode-2">Hello World</span>
```

=> the DOM will not get the static "attribute".

- 2024-07-12T09:38:22Z @tobiu closed this issue

