---
id: 5371
title: 'main.addon.Navigator: navigateTargetChildListChange() => steals focus'
state: CLOSED
labels:
  - bug
assignees:
  - ExtAnimal
createdAt: '2024-03-22T17:36:32Z'
updatedAt: '2024-03-27T15:18:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5371'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-27T15:18:46Z'
---
# main.addon.Navigator: navigateTargetChildListChange() => steals focus

while it does make sense for a `form.field.ComboBox`, the current behavior causes serious problems.

```
    // This is called if mutations take place within the subject element.
    // We have to keep things in order if the list items change.
    navigateTargetChildListChange(mutations, data) {
        this.fixItemFocusability(data);

        // Active item gone.
        // Try to activate the item at the same index;
        if (data.activeItem && !data.subject.contains(data.activeItem)) {
            const allItems = data.subject.querySelectorAll(data.selector);

            allItems.length && this.navigateTo(allItems[Math.max(Math.min(data.activeIndex, allItems.length - 1), 0)], data);
        }
    }
```

inside the learning section we have a topics list on the left, and a page sections list on the right side.

1. navigate to a topic page
2. click any item inside the right list
3. navigate to a different topic
4. the right list gets new store data
5. at this point, the right list steals the focus, to re-focus the last index

without doing a deep dive, my first impression is that a `ComboBox` should send a target focus node id. if this one has the focus, keep the current logic. if it does not have the focus, do not re-apply it.

thoughts? @maxrahder @mxmrtns 

## Timeline

- 2024-03-22T17:36:32Z @tobiu added the `bug` label
- 2024-03-22T17:36:32Z @tobiu assigned to @ExtAnimal
- 2024-03-27T15:17:03Z @tobiu referenced in commit `b9df7e3` - "main.addon.Navigator: navigateTargetChildListChange() => steals focus #5371"
### @tobiu - 2024-03-27T15:18:46Z

@ExtAnimal: added the config `keepFocusIndex` inside `list.Base` with a default to false. ComboBox will pass true into its list instance.

if you have a better idea to fix it, please open a new ticket.

- 2024-03-27T15:18:46Z @tobiu closed this issue

