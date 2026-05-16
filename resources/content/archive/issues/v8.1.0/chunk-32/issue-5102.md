---
id: 5102
title: 'selection/RowModel.mjs  onRowClick:   additionally respond according to key-press properties '
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-11-19T06:12:30Z'
updatedAt: '2024-12-12T02:44:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5102'
author: gplanansky
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-12-12T02:44:45Z'
---
# selection/RowModel.mjs  onRowClick:   additionally respond according to key-press properties 

**proposed feature enhancement:**
Current selection/RowModel.mjs  onClick fires select or deselect  for all clicks, that is both simple clicks and  and keypress click combos.

This feature enhancement provides for additional distinct actions,   for clicks with alt, ctrl, meta and shift key presses, by firing 'altSelect', 'ctrlSelect', 'metaSelect' and 'shiftSelect' signals.

**Motivation:**  the immediate motivation is to trigger a dialog to edit table row values, 

**proposed code**

src/selection/RowModel.mjs   line  121 ff

```
onRowClick(data) {
    let me   = this,
        node = RowModel.getRowNode(data.path),
        id   = node?.id,
        view = me.view,
        isSelected, record;

    if (! id) { return };

    record = view.store.getAt(VDomUtil.findVdomChild(view.vdom, id).index);

    if (data.altKey) {
        view.fire('altSelect', {data, record})
    } else if (data.ctrlKey ) {
        view.fire('ctrlSelect', {data, record})
    } else if (data.metaKey ) {
        view.fire('metaSelect', {data, record})
    } else if (data.shiftKey ) {
        view.fire('shiftSelect', {data, record})
    } else {
        me.toggleSelection(id);
        isSelected = me.isSelected(id);

        !isSelected && view.onDeselect?.(record);

        view.fire(isSelected ? 'select' : 'deselect', {
            record
        });
    }
}
```

**comment**
It is potentially useful to include both the click event data, and the record, in the  fire signal payloads.   However to avoid breaking things the above code does not change the payload of the original select and deselect signals.

## Timeline

- 2023-11-19T06:12:31Z @gplanansky added the `enhancement` label
- 2023-12-01T14:11:54Z @gplanansky cross-referenced by PR #5120
### @github-actions - 2024-08-29T02:26:17Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:18Z @github-actions added the `stale` label
### @gplanansky - 2024-08-29T03:23:14Z

I still need this.   Almost a  year old.

- 2024-08-30T02:26:43Z @github-actions removed the `stale` label
### @github-actions - 2024-11-28T02:43:02Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-11-28T02:43:02Z @github-actions added the `stale` label
### @github-actions - 2024-12-12T02:44:45Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-12-12T02:44:45Z @github-actions closed this issue

