---
id: 5430
title: Shorten class exports for singleton files
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-22T08:50:32Z'
updatedAt: '2024-06-22T13:10:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5430'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-22T13:10:04Z'
---
# Shorten class exports for singleton files

I guess this one is a bit controversial. file size VS readability.

for a normal class we are doing:
```
Neo.setupClass(ServiceBase);

export default ServiceBase;
```

for a singleton it changes to:
```
let instance = Neo.setupClass(App);

export default instance;
```

=> setupClass() will return an instance if (and only if) the singleton config is set to true.

while the code will shorten when getting minified:
```
let i = Neo.setupClass(App);

export default i;
```

i would still prefer:
```
export default Neo.setupClass(App);
```

rationale: you don't define variables for things you only use once.

## Timeline

- 2024-06-22T08:50:32Z @tobiu added the `enhancement` label
- 2024-06-22T08:50:33Z @tobiu assigned to @tobiu
- 2024-06-22T09:08:01Z @tobiu referenced in commit `4d8fdd2` - "Shorten class exports for singleton files #5430"
- 2024-06-22T13:10:04Z @tobiu closed this issue

