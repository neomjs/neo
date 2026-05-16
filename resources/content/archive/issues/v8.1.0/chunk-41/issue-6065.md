---
id: 6065
title: 'manager.Component: add a 2nd map for wrapped components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-06T10:09:38Z'
updatedAt: '2024-11-06T12:11:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6065'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-06T12:11:15Z'
---
# manager.Component: add a 2nd map for wrapped components

```
    addVnodeComponentReferences(vnode, ownerId) {
        vnode = {...vnode}; // shallow copy

        let me         = this,
            childNodes = vnode?.childNodes ? [...vnode.childNodes] : [],
            component;

        vnode.childNodes = childNodes;

        childNodes.forEach((childNode, index) => {
            if (!childNode.componentId && childNode.id !== ownerId) {
                // searching for wrapped components as a fallback
                component = me.get(childNode.id) || me.findFirst('vdom.id', childNode.id)
            }

            childNodes[index] = component ?
                {componentId: component.id, id: component.vdom.id} :
                this.addVnodeComponentReferences(childNode, ownerId)
        });

        return vnode
    }
```

to keep the vdom & vnode trees in sync, we need to add component references into the vnode tree as well.

e.g. rendering the viewport => we get the full vnode (DOM) tree of the entire app. then we need to walk over every node to see if it is a cmp.

for most cmps this is an easy map check inside manager.Component. however, there are wrapped cmps, which can have 1-x parent nodes.

querying manager.Component to identify them is not reasonable (slow).

my first idea was to create manager.WrappedComponent, but i doubt that devs would need it for querying / searching.

so we can just add a second map into manager.Component. key => wrapper node id, value => component reference.

should be sufficient and lightweight.

## Timeline

- 2024-11-06T10:09:38Z @tobiu added the `enhancement` label
- 2024-11-06T10:09:39Z @tobiu assigned to @tobiu
- 2024-11-06T11:12:55Z @tobiu referenced in commit `00d6a09` - "manager.Component: add a 2nd map for wrapped components #6065"
- 2024-11-06T12:11:16Z @tobiu closed this issue
- 2024-11-08T13:09:16Z @tobiu referenced in commit `4731043` - "manager.Component: add a 2nd map for wrapped components #6065"

