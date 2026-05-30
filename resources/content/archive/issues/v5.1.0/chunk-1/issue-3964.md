---
id: 3964
title: Adding underscored configs to Neo.Override
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-01-31T13:32:44Z'
updatedAt: '2023-02-01T10:36:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3964'
author: Dinkh
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-01T10:36:16Z'
---
# Adding underscored configs to Neo.Override

I want to be able to add an override including afterSetFoo.
That way I can add a real override, which can be supported in the next release or only to my custom project.

```
Neo.overrides = {
    Neo: {
        component: {
            Base: {
                bar: 2,
                foo_: 1,

                afterSetFoo: function(newValue, oldValue) {
                    let style = this.style;
                    style.color = 'green';
                    this.style = style;
                }
            }
        }
    }
};

export default Neo.overrides;
```

## Timeline

- 2023-01-31T13:32:44Z @Dinkh added the `enhancement` label
- 2023-01-31T13:33:14Z @Dinkh cross-referenced by PR #3963
- 2023-02-01T10:36:16Z @tobiu closed this issue

