---
id: 5342
title: 'form.field.Select: update the component tests'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2024-03-15T13:43:41Z'
updatedAt: '2024-09-12T02:28:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5342'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:00Z'
---
# form.field.Select: update the component tests

Some of the current tests make no longer sense from an UX perspective.

Example:
```
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wyoming")');

        await t.type(null, '[ENTER]');

        await t.waitForSelectorNotFound('.neo-picker-container:visible');

        await t.waitFor(100);

        t.is(inputField.value, 'Wyoming');

        await t.type(null, '[DOWN]');

        // Picker Must show with Wyoming activated
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wyoming")');

        await t.type(null, '[UP]');

        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wisconsin")');
```

input value changes will open the picker and filter the related list.

navigating to an item (Wyoming) and then hitting ENTER will drop this name into the input field and then the list gets filtered down to only contain this item. so, navigating up to an item which does not match the filter (Wisconsin) can not work.

@ExtAnimal 

## Timeline

- 2024-03-15T13:43:41Z @tobiu added the `enhancement` label
- 2024-03-15T13:43:42Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-29T02:25:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:26Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:00Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:01Z @github-actions closed this issue

