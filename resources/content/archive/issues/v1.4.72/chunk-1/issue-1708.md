---
id: 1708
title: 'model.Component: data format for binding strings'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-01T15:25:40Z'
updatedAt: '2021-04-01T21:50:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1708'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-01T21:50:37Z'
---
# model.Component: data format for binding strings

instead of using:
```
bind: {
    text: 'button1Text'
}
```

we should switch to the format:
```
bind: {
    text: '${data.button1Text}'
}
```

this will make it easier to pass formulas in the future.

todos:
* adjust the 4 example apps
* add a value parser to `model.Component`

## Timeline

- 2021-04-01T15:25:40Z @tobiu added the `enhancement` label
- 2021-04-01T15:25:41Z @tobiu assigned to @tobiu
- 2021-04-01T18:15:36Z @tobiu referenced in commit `756dd6e` - "#1708 current progress => initial binding value replacements work with the new enhanced binding strings"
- 2021-04-01T20:07:12Z @tobiu referenced in commit `2c350b5` - "#1708 model.Component: getFormatterVariables() => first PoC"
- 2021-04-01T20:11:19Z @tobiu referenced in commit `707c5c0` - "#1708 model.Component: getFormatterVariables() => store the 2 regex inside top level module variables"
- 2021-04-01T20:20:45Z @tobiu referenced in commit `1fd40e5` - "#1708 model.Component: getFormatterVariables() => using NeoArray to ensure variables are not added more than once"
- 2021-04-01T20:22:56Z @tobiu referenced in commit `64f69cf` - "#1708 model.Component: resolveBindings() using getFormatterVariables()"
- 2021-04-01T20:51:33Z @tobiu referenced in commit `c664217` - "#1708 model.Component: createBindingByFormatter()"
- 2021-04-01T21:06:20Z @tobiu referenced in commit `7a74e31` - "#1708 model.Component: createBindingByFormatter(), createBinding() => adjusted the logic to store bindings including the formatter"
- 2021-04-01T21:30:18Z @tobiu referenced in commit `6502e59` - "#1708 model.Component: fully working version"
### @tobiu - 2021-04-01T21:50:37Z

it got super nice now, we can already handle complex formulas like:

```
bind: {
    text: 'Hello ${data.button2Text} ${1+2} ${data.button1Text + data.button2Text}'
}
```

- 2021-04-01T21:50:38Z @tobiu closed this issue

