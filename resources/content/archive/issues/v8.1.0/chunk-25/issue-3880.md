---
id: 3880
title: '"One thing i noticed when creating the PoC:"'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-01-16T20:14:48Z'
updatedAt: '2023-01-24T18:22:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3880'
author: arcman7
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-24T18:22:14Z'
---
# "One thing i noticed when creating the PoC:"

You mentioned in your medium article:

** "One thing i noticed when creating the PoC:**
> worker.port.addEventListener('message', me.onMessage.bind(me), false);

does not work, while you can use addEventListener() on a non shared worker. Might be worth a ticket. This change solved it:
> worker.port.onmessage = me.onWorkerMessage.bind(me);


From Mozilla:
> We have to call port.start(); inside the onconnect event handler at the end if we want to use addEventListener to add a listener to the message event instead of assigning an event handler to onmessage .

## Timeline

- 2023-01-16T20:14:48Z @arcman7 added the `bug` label
### @tobiu - 2023-01-16T20:28:14Z

Hi @arcman7!

Could you please provide more input, about what you would like to change?
I am assuming you mean:
https://github.com/neomjs/neo/blob/dev/src/worker/Base.mjs#L137

The current version does work in FF.

### @arcman7 - 2023-01-17T00:06:20Z

I'm not saying your code needs to be fixed since it works, but I just thought you should know that the "bug" you referenced in your medium article
https://medium.com/swlh/chrome-v83-enables-js-module-support-for-sharedworkers-starting-a-new-era-for-multi-browser-dbb20366bddf

is actually a feature and working as intended. In your case all you had to do was call 
`worker.port.start()`

After you used 
`worker.port.addEventListener('message', me.onMessage.bind(me), false);`


- 2023-01-24T18:22:14Z @arcman7 closed this issue

