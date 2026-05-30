---
id: 5855
title: 'collection.Base: add protected for the map'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-08T22:10:06Z'
updatedAt: '2024-09-08T23:26:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5855'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-08T23:26:30Z'
---
# collection.Base: add protected for the map

doc comments

## Timeline

- 2024-09-08T22:10:06Z @tobiu added the `enhancement` label
- 2024-09-08T22:10:06Z @tobiu assigned to @tobiu
- 2024-09-08T22:10:19Z @tobiu referenced in commit `e4f6cb6` - "collection.Base: add protected for items & map #5855"
- 2024-09-08T22:10:21Z @tobiu closed this issue
- 2024-09-08T23:23:46Z @tobiu reopened this issue
### @tobiu - 2024-09-08T23:25:17Z

did another dive into the code (was too long ago).

while `map` should be protected, items can get used directly:

```
    t.it('Create collection', t => {
        collection = Neo.create(Collection, {
            keyProperty: 'githubId',
            items: [
                {country: 'Germany',  firstname: 'Tobias', githubId: 'tobiu',         lastname: 'Uhlig'},
                {country: 'Germany',  firstname: 'Tobias', githubId: 'tobiu2',        lastname: 'Uhlig2'},
                {country: 'USA',      firstname: 'Rich',   githubId: 'rwaters',       lastname: 'Waters'},
                {country: 'Germany',  firstname: 'Nils',   githubId: 'mrsunshine',    lastname: 'Dehl'},
                {country: 'USA',      firstname: 'Gerard', githubId: 'camtnbikerrwc', lastname: 'Horan'},
                {country: 'Slovakia', firstname: 'Jozef',  githubId: 'jsakalos',      lastname: 'Sakalos'}
            ],
            sorters: [
                {direction: 'ASC',  property: 'firstname'},
                {direction: 'DESC', property: 'lastname'}
            ]
        });

        t.isStrict(collection.getCount(), 6, 'Collection has 6 items');
        t.isStrict(collection.map.size, 6, 'map has 6 items');
    });
```

this changes for a `data.Store` => here we need `data` to convert input items into records.

- 2024-09-08T23:26:17Z @tobiu referenced in commit `84dabca` - "collection.Base: add protected for the map #5855"
- 2024-09-08T23:26:24Z @tobiu changed title from **collection.Base: add protected for items & map** to **collection.Base: add protected for the map**
- 2024-09-08T23:26:30Z @tobiu closed this issue

