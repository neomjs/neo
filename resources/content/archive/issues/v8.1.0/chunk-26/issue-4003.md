---
id: 4003
title: 'manager.Component: getChildren() => smarter logic required'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-07T13:48:05Z'
updatedAt: '2023-02-07T14:08:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4003'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-07T14:08:28Z'
---
# manager.Component: getChildren() => smarter logic required

the original implementation is really old to be fair:
```javascript
getChildren(component) {
    let childComponents = [],
        childNodes      = VNodeUtil.getChildIds(component.vnode),
        childComponent;

    childNodes.forEach(node => {
        childComponent = this.get(node);

        if (childComponent) {
            childComponents.push(childComponent);
        }
    });

    return childComponents;
}
```

it is parsing the vnode, which does not exist before a component has been rendered. instead, we want to search the collection recursively for `parentId` matches.

## Timeline

- 2023-02-07T13:48:05Z @tobiu added the `enhancement` label
- 2023-02-07T13:48:06Z @tobiu assigned to @tobiu
### @tobiu - 2023-02-07T14:07:32Z

the vnode logic is actually still needed inside component.Base. i added a new method called `getChildComponents()` and will use it inside the `form.Container` logic.

- 2023-02-07T14:07:47Z @tobiu referenced in commit `3f5cb59` - "manager.Component: getChildren() => smarter logic required #4003"
- 2023-02-07T14:08:28Z @tobiu closed this issue

