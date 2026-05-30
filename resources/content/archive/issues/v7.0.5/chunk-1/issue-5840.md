---
id: 5840
title: 'update npx neo-app MyApp example to "export default Neo.setupClass(...)" '
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-08-27T20:54:59Z'
updatedAt: '2024-08-27T21:50:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5840'
author: gplanansky
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-27T21:42:46Z'
---
# update npx neo-app MyApp example to "export default Neo.setupClass(...)" 

**to fix:**  npx neo-app _MyApp_ example", which broke with the 7.0.3 change to "export default Neo.setupClass(<classname>)" usage.

**old usage breaks:**
```
Neo.applyClassConfig(MainContainer);

export default MainContainer;

```
**new usage:**
`export default Neo.setupClass(MainContainer);`

**See:**
https://github.com/neomjs/neo/blob/c70ce319114232d83c2f146005b7e14abac42ed3/buildScripts/tools/createExample.mjs#L153

## Timeline

- 2024-08-27T20:54:59Z @gplanansky added the `bug` label
### @tobiu - 2024-08-27T21:27:17Z

makes sense.

the breaking part was: https://github.com/neomjs/neo/issues/5817

### @tobiu - 2024-08-27T21:42:46Z

https://github.com/neomjs/create-app/commit/1ccfaf42a1bfb188d3792e4ccdf101a42097f9a6
https://github.com/neomjs/create-app/commit/a04b327bbd791f3aee99e867a44581d1d82a34ed

- 2024-08-27T21:42:46Z @tobiu closed this issue
### @tobiu - 2024-08-27T21:50:56Z

i will add a new ticket for the create example script which @ThorstenRaab created.


