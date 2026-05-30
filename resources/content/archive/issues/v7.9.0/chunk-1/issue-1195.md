---
id: 1195
title: Discussion on bindings
state: CLOSED
labels:
  - enhancement
  - discussion
  - stale
assignees: []
createdAt: '2020-09-15T12:17:34Z'
updatedAt: '2024-09-27T02:34:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1195'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:15Z'
---
# Discussion on bindings

Torsten brought up this topic yesterday.

Adding view models to neo should be fairly easy (we already have view controllers in place).

It can be useful for a component to have a VM, since you can check for parent VMs inside the parent component tree and get / set those values.

We could wrap all VM variables into a data config inside the class or use top level configs for each. We definitely need change events for the VM vars.

With this in place, we can add bindings as a next step.

I personally think that it can make sense to bind component based configs to VM vars. The component can use afterSetX() methods to adjust the virtual dom if needed.

Since neo is not using templates, but a persistent virtual dom tree, I would avoid direct bindings from the VM into the vdom tree itself. While we can easily parse the vdom tree to figure out which bindings exist there, the vdom tree structure is highly dynamic. Meaning: in case there were direct bindings into the vdom tree, each vdom change would need a full bindings-reparsing, since every change could remove a binding or a node which has a binding. This would be very expensive.

I think React (the JSX output) allows these bindings though. Did not look at it for a long time. If I remember it right, bindings would be functions inside the vdom tree, which can access class or VM configs / vars). We could do something like this, but then we need to resolve all functions into their return values before passing the vdom tree to the vdom worker (could get expensive as well).

I would love to get your input on this one! If you think we need either VM vars => Component config and / or VM vars => vdom tree bindings, please add your feedback here. In case this is a topic of interest, we can figure out a strategy on how to implement it and drop it into one of the next sprints.

Best regards, Tobi

## Timeline

- 2020-09-15T12:17:34Z @tobiu added the `enhancement` label
- 2020-09-15T12:17:34Z @tobiu added the `discussion` label
### @Dinkh - 2020-09-16T12:37:41Z

I see 2 additional objects here
### Data Binding
        Key:     DataBinding Key
        Value: Array of all occurrences 
### Component Tree
        Key Component
        Value Object
                     Data Binding Key
                     Setter or vdom,
                             whatever minimum args necessary to make vdom render
                             scope for setter
                     string with DataBinding

... Then there is logic for Parent VM

... and running through the process

    setVMData: () => {
           Start: silent
           End: Update the dom
    }


### @github-actions - 2024-09-13T02:31:03Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:04Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:15Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:15Z @github-actions closed this issue

