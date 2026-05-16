---
id: 137
title: 'Missing files, broken links, fails to load'
state: CLOSED
labels:
  - question
assignees: []
createdAt: '2019-11-29T16:19:24Z'
updatedAt: '2019-12-02T22:24:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/137'
author: diplopito
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-12-02T22:24:54Z'
---
# Missing files, broken links, fails to load

Hi Tobias,

I am trying to get started with Neo. I have found the following issues:

Broken links or non existing files:
- localhost/neo/examples/helix
- localhost/neo/dist/development/examples
- localhost/neo/dist/production/examples
- Under dist there are only /docs folders
- When trying to view /dist/production/docs or /dist/development/docs the file main.js is missing in both
- After setting the flag in Chrome, when trying to access any example, all the pages are blank. Console error is: 
```Failed to load module script: The server responded with a non-JavaScript MIME type of "". Strict MIME type checking is enforced for module scripts per HTML spec. ```

Suggestion:
- In README.md, the server requirements should go first: mjs should be added as js type in the server prior to accessing the examples, otherwise they won't run.
- Create a web site where the examples can be seen/tested

Unfortunately, with all these issues, I haven't been able to see any component.



## Timeline

- 2019-11-29T16:19:24Z @diplopito added the `bug` label
### @tobiu - 2019-11-29T16:31:03Z

Hi and welcome to the neo.mjs community diplopito,

there were indeed wrong links inside the examples readme for the helix. pushed a fix.

the easiest way to get a configured webserver is:
```
npm run server-start
```
the script will throw 2 errors which you can ignore for now, but should open a new chrome tab right away.

to get the content inside the dist folders, you need to run the following scripts:
```
npm run build-development
npm run build-production
```
the examples outside the dist folder (e.g. localhost/neo/examples/component/helix) are way more impressive, since you get the real JS modules inside the browser, like:
![neo_worker_setup](https://user-images.githubusercontent.com/1177434/69881637-f10d5580-12cd-11ea-9ea9-731807f0441e.png)


online examples will follow in a couple of days, i am working on the github pages for the real world demo app first (should be completed today) ;)

### @tobiu - 2019-11-29T18:50:45Z

https://neomjs.github.io/pages/

- 2019-12-01T19:40:26Z @tobiu removed the `bug` label
- 2019-12-01T19:40:26Z @tobiu added the `question` label
### @diplopito - 2019-12-02T22:24:54Z

Hi Tobias,

I cloned it again, followed the steps and it's running very nice. The new examples site looks great, I will start soon working on a couple of projects to learn Neo, very promising indeed. Thanks and congratulations!

- 2019-12-02T22:24:55Z @diplopito closed this issue

