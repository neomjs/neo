---
id: 6132
title: 'Covid.view.MainContainerController: applySummaryData() => vdom access'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-29T14:49:49Z'
updatedAt: '2024-11-29T15:08:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6132'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-29T15:08:32Z'
---
# Covid.view.MainContainerController: applySummaryData() => vdom access

```
    applySummaryData(data) {
        let me        = this,
            container = me.getReference('total-stats'),
            {vdom}    = container;

        me.summaryData = data;

        vdom.cn[0].cn[1].html = Util.formatNumber({value: data.cases});
        vdom.cn[1].cn[1].html = Util.formatNumber({value: data.active});
        vdom.cn[2].cn[1].html = Util.formatNumber({value: data.recovered});
        vdom.cn[3].cn[1].html = Util.formatNumber({value: data.deaths});

        container.update();
        // ...
    }
```

this logic can no longer work in neo v8 => vdom.cn[0] => {componentId: 'neo-component-2'}

we either need to aggregate the vdom tree or access the child cmps directly to update in parallel.

## Timeline

- 2024-11-29T14:49:49Z @tobiu added the `enhancement` label
- 2024-11-29T14:49:50Z @tobiu assigned to @tobiu
- 2024-11-29T15:08:27Z @tobiu referenced in commit `8962fa2` - "Covid.view.MainContainerController: applySummaryData() => vdom access #6132"
- 2024-11-29T15:08:33Z @tobiu closed this issue

