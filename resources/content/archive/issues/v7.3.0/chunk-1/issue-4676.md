---
id: 4676
title: 'component.Base: afterSetVdom() => add a check in case no vnode is there yet'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-08-08T19:02:13Z'
updatedAt: '2024-09-13T02:29:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4676'
author: tobiu
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:19Z'
---
# component.Base: afterSetVdom() => add a check in case no vnode is there yet

since this means, that no update cycle is running, we need to do this inside `afterSetMounted()`.

## Timeline

- 2023-08-08T19:02:13Z @tobiu added the `enhancement` label
- 2023-08-08T19:02:14Z @tobiu assigned to @tobiu
- 2023-08-08T19:07:00Z @tobiu referenced in commit `f69d422` - "component.Base: afterSetVdom() => add a check in case no vnode is there yet #4676"
- 2023-08-08T19:18:31Z @tobiu closed this issue
- 2023-08-08T19:32:49Z @tobiu reopened this issue
### @tobiu - 2023-08-08T19:33:19Z

this one can break card layouts & key navs. reverting it for now. needs more testing.

- 2023-08-08T19:33:32Z @tobiu referenced in commit `56d8ff1` - "#4676"
- 2023-08-08T19:34:15Z @tobiu closed this issue
### @tobiu - 2023-08-08T20:10:18Z

found a way

- 2023-08-08T20:10:18Z @tobiu reopened this issue
### @tobiu - 2023-08-09T09:27:29Z

more input on the topic:

```
    afterSetVdom(value, oldValue) {
        let me   = this,
            app  = Neo.apps[me.appName],
            vdom = value,
            isParentVdomUpdating, listenerId;

        // It is important to keep the vdom tree stable to ensure that containers do not lose the references to their
        // child vdom trees. The if case should not happen, but in case it does, keeping the reference and merging
        // the content over seems to be the best strategy
        if (me._vdom !== vdom) {
            Logger.warn('vdom got replaced for: ' + me.id + '. Copying the content into the reference holder object');

            Object.keys(me._vdom).forEach(key => {
                delete me._vdom[key]
            });

            vdom = Object.assign(me._vdom, vdom)
        }

        if (!me.needsParentUpdate()) {
            if (me.silentVdomUpdate) {
                me.needsVdomUpdate = true
            } else {
                isParentVdomUpdating = me.isParentVdomUpdating();

                if (!me.mounted && me.isConstructed && !me.hasRenderingListener && app?.rendering === true) {
                    me.hasRenderingListener = true;

                    listenerId = app.on('mounted', () => {
                        app.un('mounted', listenerId);

                        setTimeout(() => {
                            me.vnode && me.updateVdom(me.vdom, me.vnode)
                        }, 50)
                    })
                } else if (me.mounted && me.vnode && !isParentVdomUpdating) {
                    me.updateVdom(vdom, me.vnode)
                } else if (!me.vnode && !isParentVdomUpdating && me.isConstructed) {
                    console.log(this.id, me.mounted, me.rendering, app?.rendering);
                    me.needsVdomUpdate = true
                }
            }
        } else {
            me.needsVdomUpdate = false
        }

        me.hasUnmountedVdomChanges = !me.mounted && me.hasBeenMounted
    }
```

adding a check => `else if (!vnode)`

and then:
```
    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            if (value) {
                me.hasBeenMounted = true;

                if (me.domListeners?.length > 0) {
                    // todo: the main thread reply of mount arrives after pushing the task into the queue which does not ensure the dom is mounted
                    setTimeout(() => {
                        DomEventManager.mountDomListeners(me)
                    }, 100)
                }

                me.fire('mounted', me.id);

                this.needsVdomUpdate && this.update()
            }
        }
    }
```
=> `this.needsVdomUpdate && this.update()`

does fix an edge case bug inside our client app, when we open a card layout with an lazy loaded active card, destroying the view & afterwards re-creating it, but this has severe side effects.

e.g. for `component.Gallery` inside our covid app, a parent container will get the `needsVdomUpdate` state and this will never get cleared again. neither the parent container nor any of its parent are inside an update cycle.

this one needs a closer look and goes pretty deep into `component.Base`.

### @github-actions - 2024-08-29T02:26:49Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:50Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:19Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:19Z @github-actions closed this issue

