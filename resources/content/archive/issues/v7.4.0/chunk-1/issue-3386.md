---
id: 3386
title: 'component.Carousel: itemCls'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - Dinkh
createdAt: '2022-08-10T07:35:21Z'
updatedAt: '2024-09-14T02:26:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3386'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:54Z'
---
# component.Carousel: itemCls

Hi Torsten,

I merged your PR. The itemClick logic seems to be copied from a list and feels a bit odd to me.

config:
```
        /**
         * Custom cls added to each item
         * This is only a single string
         *
         * @member {String|null} itemCls=null
         */
        itemCls: null,
```

domListeners:
```
            click: {
                fn      : me.onClick,
                delegate: '.neo-carousel-item',
                scope   : me
            }
```
i guess `neo-carousel-item` should be the itemCls



```
    onClick(data) {
        let me = this,
            item;

        if (data.path[0].id === me.id) {
            me.onContainerClick(data);
        } else {
            for (item of data.path) {
                if (item.cls.includes(me.itemCls)) {
                    me.onItemClick(item, data);
                    break;
                }
            }
        }
    }
```
since we delegate to a static itemCls => `neo-carousel-item`, the container click if case can never happen. the else case will only trigger in case a dev does set its custom `iconCls` on top of the default one.

tl-br: using `neo-carousel-item` as the default value for itemCls and polishing the `onClick()` logic feels needed.

thoughts?

## Timeline

- 2022-08-10T07:35:21Z @tobiu added the `enhancement` label
- 2022-08-10T07:35:21Z @tobiu assigned to @Dinkh
### @github-actions - 2024-08-30T02:27:49Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:50Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:54Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:54Z @github-actions closed this issue

