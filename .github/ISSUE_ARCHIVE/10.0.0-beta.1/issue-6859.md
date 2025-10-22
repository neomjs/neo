---
id: 6859
title: 'Portal.view.blog.List: Clearing the filter no longer works'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-06-24T09:33:56Z'
updatedAt: '2025-06-24T14:40:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6859'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-24T14:40:01Z'
---
# Portal.view.blog.List: Clearing the filter no longer works

**Reported by:** @tobiu on 2025-06-24

* Deprecation issue: it did work fine before.
* It is not related to the new `useDomApiRenderer` config => breaks in both modes.
* It is related to the custom `filterItems()` logic.
* Changing the logic to use `removeDom` instead of `style.display = 'none'` would help, but we need to find the root cause.
* All items get parsed inside the `filterItems()` loop.
* Logging the deltas reveals up to 300 delta OPs, trying to insert nodes and update the structure.
* My guess is: If the vnode => vdom id sync had an issue, and we would get new auto-generated ids for parts of a list item, this would explain it.

Since this issue affects various areas of the framework, it is most likely a "tobi only" ticket.

I need to dive into it, before we can declare v10 as stable.

## Comments

### @tobiu - 2025-06-24 11:24

this was a fascinating debugging session.

`vdom.Helper: compareAttributes()` contained a crazy bad typo:

```
                switch (prop) {
                    case 'attributes':
                        attributes = {};

                        Object.entries(value).forEach(([key, value]) => {
                            const
                                oldValue    = oldVnode.attributes[key],
                                hasOldValue = Object.hasOwn(oldVnode.attributes, 'key');
```

this obviously has to be:

```
                                hasOldValue = Object.hasOwn(oldVnode.attributes, key);
```

key lesson learned: never trust AI :)

This typo meant: every attribute which did NOT get changed returned a delta to change it to its same value, leading to a MASSIVE overhead of deltas in v10 afterwards.

I did not even notice it, since Neo can easily handle 40k deltas per second.

The second issue was inside the `vdom.VNode` interface: in v9, a vnode inside the vdom worker always contained `style: {}` in case there were no styles. To minify it, the styles property got removed in case it is empty in v10.

`util.Style: compareStyles()` had a bug when receiving undefined as the newValue, which is fixed now.

The key lesson learned: the entire auto-id on vnode level synchronization back to vdom structures works perfectly fine. I was a bit worried that this part broke => not the case.

