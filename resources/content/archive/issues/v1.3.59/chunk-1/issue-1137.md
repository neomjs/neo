---
id: 1137
title: 'manager.DomEvent: fire() => mouseenter & mouseleave while dragging'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-28T12:08:24Z'
updatedAt: '2020-08-28T15:26:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1137'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-28T12:22:04Z'
---
# manager.DomEvent: fire() => mouseenter & mouseleave while dragging

This one is an interesting issue.

```
// we only want mouseenter & leave to fire on their top level nodes, not for children
if (eventName === 'mouseenter' || eventName === 'mouseleave') {
    targetId = eventName === 'mouseenter' ? data.fromElementId : data.toElementId;

    if (targetId && targetId !== delegationTargetId) {
        delegationVdom = VDomUtil.findVdomChild(component.vdom, delegationTargetId);

        if (delegationVdom.vdom && VDomUtil.findVdomChild(delegationVdom.vdom, targetId)) {
            preventFire = true;
        }
    }
}
```

E.g. for dialogs, we can drag a proxyEl over the real dialog. In this case, we get mouseenter & leave events for it. the targetId is in this case outside of the dialog, so delegationVdom can actually be undefined.

I will add a check to not fire the event(s) here.

We could enhance the main thread further => main.addon.DragDrop could fire events to let main.DomEvents know that a drag OP is in progress, in which case we could suppress specific events. Would be a follow up ticket.

## Timeline

- 2020-08-28T12:08:24Z @tobiu added the `enhancement` label
- 2020-08-28T12:08:24Z @tobiu assigned to @tobiu
- 2020-08-28T12:10:58Z @tobiu referenced in commit `f5b32af` - "manager.DomEvent: fire() => mouseenter & mouseleave while dragging #1137"
- 2020-08-28T12:21:07Z @tobiu referenced in commit `c4293e1` - "#1137 manager.DomEvent:  moved the logic into static verifyMouseEnterLeave()"
### @tobiu - 2020-08-28T12:22:04Z

moved the logic outside of the fire() method.

```
    /**
     *
     * @param {Neo.component.Base} component
     * @param {Object} data
     * @param {String} delegationTargetId
     * @param {String} eventName
     * @returns {Boolean}
     */
    static verifyMouseEnterLeave(component, data, delegationTargetId, eventName) {
        let targetId = eventName === 'mouseenter' ? data.fromElementId : data.toElementId,
            delegationVdom;

        if (targetId && targetId !== delegationTargetId) {
            delegationVdom = VDomUtil.findVdomChild(component.vdom, delegationTargetId);

            // delegationVdom can be undefined when dragging a proxy over the node.
            // see issues/1137 for details.
            if (!delegationVdom || delegationVdom.vdom && VDomUtil.findVdomChild(delegationVdom.vdom, targetId)) {
                return false;
            }
        }

        return true;
    }
```

- 2020-08-28T12:22:04Z @tobiu closed this issue

