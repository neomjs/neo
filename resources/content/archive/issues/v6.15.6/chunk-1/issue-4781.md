---
id: 4781
title: 'container.Base: getItem()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-25T14:28:53Z'
updatedAt: '2024-04-07T15:16:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4781'
author: ThorstenRaab
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-07T15:16:14Z'
---
# container.Base: getItem()

``` 
    /**
    * @param {String} reference
    * @returns {Object|Neo.component.Base|null}
    */
    getItem(reference, items = this.items) {
        let i     = 0,
            len   = items.length,
            item,
            childItem;
        
            for (; i < len; i++) {
                item = items[i];
                if (item.reference === reference) {
                    return item
                } else if (item.items) {
                    childItem = this.getItem(reference, item.items);

                    if (childItem) {
                        return childItem;
                    }
                }
            }
        return null
    }
````
something like this would help to address components better

## Timeline

- 2023-08-25T14:28:53Z @ThorstenRaab added the `enhancement` label
- 2024-04-07T14:47:42Z @tobiu assigned to @tobiu
- 2024-04-07T14:54:03Z @tobiu referenced in commit `a38df7e` - "container.Base: getItem() #4781"
- 2024-04-07T15:16:14Z @tobiu closed this issue

