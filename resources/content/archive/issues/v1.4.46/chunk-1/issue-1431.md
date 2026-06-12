---
id: 1431
title: Not opening in Safari
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-11-11T10:11:43Z'
updatedAt: '2020-11-11T11:45:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1431'
author: friksa
commentsCount: 7
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-11T11:45:16Z'
---
# Not opening in Safari

Trying to open this link in Safari opens a blank page with error in the console:
https://neomjs.github.io/pages/node_modules/neo.mjs/apps/sharedcovid/index.html#mainview=table
```SyntaxError: Unexpected identifier 'Neo'. import call expects exactly one argument.```

## Timeline

- 2020-11-11T10:11:43Z @friksa added the `bug` label
### @tobiu - 2020-11-11T10:28:48Z

Correct. There are actually 2 problems at once in case you would want to open the dev mode version in Safari:

1. Safari does not support JS modules inside the worker scope yet: https://github.com/neomjs/neo/issues/191
2. Safari does not support SharedWorkers at all: https://github.com/neomjs/neo/issues/697

Meaning: The dev mode can only work in Chromium based browsers for now (Chrome, Edge).
The website examples section should list the available Browsers for each one.

To develop an app, you should use Chrome.

Afterwards, you can use the build programs to create the dist/dev & dist/prod versions.
Those will also work fine in Firefox & Safari.

One limitation is the SharedWorkers context (which you will only need for multi Window apps).
This one can not run in Safari yet, even inside the dist versions.

You can open the multi window covid app in Safari:
https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/apps/sharedcovid/index.html#mainview=table

BUT this one will fall back to use normal workers instead of shared workers, so the multi window features are not available in Safari.

Pretty much the same as if you would open:
https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/apps/covid/index.html#mainview=table

You are welcome to add some weight to the Webkit based tickets => the team is thinking about implementing SW support again (they started it a long time ago & dropped it on purpose). However, this will only happen in case many devs ask for it => comment on the ticket.



- 2020-11-11T10:28:48Z @tobiu closed this issue
### @friksa - 2020-11-11T10:31:39Z

Then the browser should display a message to the user that the browser is not supported and to use Chrome (and maybe even ask them to vote for support in the browser).

Browser support is important... when someone tries this for the first time and it fails for whatever reason, the assumption is that this project does not offer any cross-browser support. Some support on all browsers are important to allow a migration path until they support these features.

### @tobiu - 2020-11-11T10:35:55Z

we can do this check easily for SWs.

Adding a check for JS module support is more tricky. Static imports like:
`import Base from './Base.mjs';`

Have to be at the very top of each file, so we can not add a check before them.

However, what we could do is adding a check into the main thread (which should support JS modules inside Safari) and in case we are inside a dist env put an error into the doc.body.

Will take a look.

- 2020-11-11T10:35:55Z @tobiu reopened this issue
- 2020-11-11T11:15:37Z @tobiu referenced in commit `8db0199` - "Not opening in Safari #1431"
- 2020-11-11T11:18:37Z @tobiu referenced in commit `6efb94c` - "#1431 info text"
### @tobiu - 2020-11-11T11:18:45Z

![Screenshot 2020-11-11 at 12 18 09](https://user-images.githubusercontent.com/1177434/98805551-095f7d00-2418-11eb-8dc4-75c41b6dcf03.png)


- 2020-11-11T11:18:45Z @tobiu closed this issue
### @tobiu - 2020-11-11T11:33:19Z

deployed to the online examples.

### @tobiu - 2020-11-11T11:34:54Z

oh shoot, the change affects chrome as well...

will polish it more.

- 2020-11-11T11:34:54Z @tobiu reopened this issue
- 2020-11-11T11:36:53Z @tobiu referenced in commit `1c64550` - "Not opening in Safari #1431 => smarter check to exclude chromium"
### @tobiu - 2020-11-11T11:45:16Z

deployed.

- 2020-11-11T11:45:16Z @tobiu closed this issue

