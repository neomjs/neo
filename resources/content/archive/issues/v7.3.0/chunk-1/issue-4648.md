---
id: 4648
title: 'model.Component: resolveFormulas() => we need a smarter check for affected keys'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - Dinkh
createdAt: '2023-08-04T20:27:14Z'
updatedAt: '2024-09-13T02:29:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4648'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:22Z'
---
# model.Component: resolveFormulas() => we need a smarter check for affected keys

the code:
```
if (!initialRun) {
    affectFormula = Object.values(value.bind).includes(data.key)
}
```
does assume that bound values are string based, which they are not. it does not honor fn calls or data.property combinations.

examples of bindings on component level:
```
bind: {
    a: data => data.a // data.a is inside a fn body
    b: data => data.a + data.b,
    c: data => MyUtil.parse(data.a + data.b),
    d: data => `Hello ${data.button2Text} ${1+2} ${data.button1Text + data.button2Text}` // template literal
},
```
One question: do you want to support formulas which use data properties from parent VMs? Asking since this is already in place for default component based bindings (which are formulas in their own way).

To understand the parsing of our bindings, follow the chain:
createBindings() => https://github.com/neomjs/neo/blob/dev/src/model/Component.mjs#L227
createBindingByFormatter() => https://github.com/neomjs/neo/blob/dev/src/model/Component.mjs#L215
getFormatterVariables() => https://github.com/neomjs/neo/blob/dev/src/model/Component.mjs#L368

Especially the last one is crucial, since it extracts data properties from fn bodies (which are strings) via regexes. You want to use it for formulas as well :)

## Timeline

- 2023-08-04T20:27:14Z @tobiu added the `enhancement` label
- 2023-08-04T20:27:15Z @tobiu assigned to @Dinkh
### @tobiu - 2023-08-04T22:57:33Z

i am still not sure if i can see the benefit of having formulas in the first place, since we can do any kind of complex bindings directly on component level.

the only reason that comes to my mind might be to "cache" binding values in case they get long. but, in this case, you can just use helper fns on cmp level. like:  `c: data => MyUtil.parse(data.a + data.b)`.

so i think if we want to keep vm based formulas, they have to be on the same level as default bindings, plus cmps must be able to actually use them (this part seems not to be implemented). like: `e: 'formula.aPlusB'`.

can you please shed some light into this?

### @github-actions - 2024-08-29T02:26:52Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:52Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:22Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:23Z @github-actions closed this issue

