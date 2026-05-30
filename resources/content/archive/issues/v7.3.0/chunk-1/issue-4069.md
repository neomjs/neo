---
id: 4069
title: 'draggable.toolbar.SortZone: switchItems() => add support for item gaps (margins)'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - stale
assignees: []
createdAt: '2023-02-17T21:20:26Z'
updatedAt: '2024-09-12T02:29:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4069'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:30Z'
---
# draggable.toolbar.SortZone: switchItems() => add support for item gaps (margins)

@MRHajari @Dinkh 

with the new theming variable `tab-button-gap`, we can now have margins between items. The drag&drop logic to re-sort tabs does not honor this yet => dragging tabs will remove the margins until the OP is done (drop).

this method is in charge:
```javascript
    /**
     * @param {Number} index1
     * @param {Number} index2
     */
    switchItems(index1, index2) {
        let me       = this,
            reversed = me.reversedLayoutDirection,
            tmp;

        if ((!reversed && index2 < index1) || (reversed && index1 < index2)) {
            tmp    = index1;
            index1 = index2;
            index2 = tmp;
        }

        let itemRects = me.itemRects,
            map       = me.indexMap,
            rect1     = itemRects[index1],
            rect2     = itemRects[index2],
            rect1Copy = {...rect1},
            rect2Copy = {...rect2};

        if (me.sortDirection === 'horizontal') {
            rect1.width = rect2Copy.width;
            rect2.left  = rect1Copy.left + rect2Copy.width;
            rect2.width = rect1Copy.width;
        } else {
            rect1.height = rect2Copy.height;
            rect2.height = rect1Copy.height;
            rect2.top    = rect1Copy.top + rect2Copy.height;
        }

        tmp         = map[index1];
        map[index1] = map[index2];
        map[index2] = tmp;

        me.updateItem(index1, rect1);
        me.updateItem(index2, rect2);
    }
```

i tried the following:
setting `tab-button-gap` to 20px. then:
```javascript
        if (me.sortDirection === 'horizontal') {
            console.log(rect2Copy.left - rect1Copy.right);
            gap = rect2Copy.left - rect1Copy.right;

            rect1.width = rect2Copy.width;
            rect2.left  = rect1Copy.left + rect2Copy.width + gap; // adding 20px instead of gap works fine
            rect2.width = rect1Copy.width;
        }
```

dragging a tab to the right works fine in this case. dragging it to the left however gets 20 - 1.5px. 1.5px is exactly the difference of the width of both tab headers inside the demo. each following switch to the left subtracts another 1.5px, so it does add up quickly.

sadly i don't have the time to deeper dive into this one until our client project MVP is done. in case someone wants to take a closer look, this would be highly appreciated!

## Timeline

- 2023-02-17T21:20:26Z @tobiu added the `enhancement` label
- 2023-02-17T21:20:26Z @tobiu added the `help wanted` label
### @github-actions - 2024-08-29T02:27:33Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:33Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:29Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:30Z @github-actions closed this issue

