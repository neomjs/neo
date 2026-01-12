---
id: 6651
title: 'button.Base: onClick() => bind handler if string'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-04-15T14:32:10Z'
updatedAt: '2025-04-15T19:39:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6651'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-15T19:29:26Z'
---
# button.Base: onClick() => bind handler if string

* view controller should not need to parse for button handlers, but it should be get driven
* => the first click on a button when the handler is a string should resolve and bind it
* `util.Function: resolveCallback()` needs to honor view controllers
* `core.Observable` needs a new `bindCallback()` method

## Timeline

- 2025-04-15T14:32:10Z @tobiu added the `enhancement` label
- 2025-04-15T14:32:25Z @tobiu referenced in commit `a32abb0` - "button.Base: onClick() => bind handler if string #6651"
### @gplanansky - 2025-04-15T19:01:37Z

@tobiu 
https://github.com/neomjs/neo/blob/a32abb086068ef9caf0b0a2a502889b6c47f6d94/src/button/Base.mjs#L502

If me.handler is undefined, e.g.:
        neo/examples/stateProvider/table  click to sort the Firstname column, this yields error message:

```
Uncaught TypeError: me.handler is not a function
    at Button.onClick (Base.mjs:503:12)
```

changing:    
`me.handler(data);`    
to:                
`me.handler         && me.handler(data)`;

makes that error message go away.

The neo/examples/table/nestedRecordfields   app   shows the same behavior, and also, for clicks to the Edit buttons, invokes a handler that does exist.

### @tobiu - 2025-04-15T19:28:22Z

Good catch George,

handlers need to stay optional. This only affects the dev branch => for the next release I need to adjust listeners & domListeners in a similar get driven way.

I will create a follow-up ticket for header buttons using `onClick()` directly.

- 2025-04-15T19:28:51Z @tobiu referenced in commit `1b907d4` - "#6651 keeping handlers optional"
- 2025-04-15T19:29:26Z @tobiu closed this issue

