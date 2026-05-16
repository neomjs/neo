---
id: 2739
title: '"Manager.mjs:384 Uncaught Error: Called sendMessage for a worker that does not exist: canvas" when trying samples'
state: CLOSED
labels: []
assignees: []
createdAt: '2021-09-20T22:29:05Z'
updatedAt: '2021-09-20T23:38:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2739'
author: davewthompson
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-09-20T23:14:30Z'
---
# "Manager.mjs:384 Uncaught Error: Called sendMessage for a worker that does not exist: canvas" when trying samples

Hey there,

Was looking at trying this UI framework for a new app, and I'm trying to view some of the samples. Some work, but trying to navigate to "http://localhost:8080/apps/sharedcovidgallery/" yields, in the console:

```
Manager.mjs:384 Uncaught Error: Called sendMessage for a worker that does not exist: canvas
    at Manager.sendMessage (Manager.mjs:384)
    at Manager.mjs:128
    at Array.forEach (<anonymous>)
    at Manager.broadcast (Manager.mjs:127)
    at DomEvents.mjs:403
    at Array.forEach (<anonymous>)
    at DomEvents.onBeforeUnload (DomEvents.mjs:402)
sendMessage @ Manager.mjs:384
(anonymous) @ Manager.mjs:128
broadcast @ Manager.mjs:127
(anonymous) @ DomEvents.mjs:403
onBeforeUnload @ DomEvents.mjs:402
Navigated to http://localhost:8080/apps/sharedcovidgallery/
```

Steps to reproduce:
```
dave@dave-macbook-pro failing-js % nvm use 16
Now using node v16.9.1 (npm v7.21.1)
dave@dave-macbook-pro failing-js % node --version
v16.9.1
dave@dave-macbook-pro failing-js % npm --version
7.21.1
dave@dave-macbook-pro failing-js % git clone -b main https://github.com/neomjs/neo.git
Cloning into 'neo'...
remote: Enumerating objects: 45776, done.
remote: Counting objects: 100% (5077/5077), done.
remote: Compressing objects: 100% (1565/1565), done.
remote: Total 45776 (delta 3544), reused 4235 (delta 3424), pack-reused 40699
Receiving objects: 100% (45776/45776), 19.69 MiB | 32.67 MiB/s, done.
Resolving deltas: 100% (31976/31976), done.
dave@dave-macbook-pro failing-js % cd neo 
dave@dave-macbook-pro neo % git status
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
dave@dave-macbook-pro neo % npm i
(...)

dave@dave-macbook-pro neo % npm run build-all

> neo.mjs@2.3.13 build-all
> node ./buildScripts/buildAll.js -f -n
(...)

dave@dave-macbook-pro neo % npm run server-start

> neo.mjs@2.3.13 server-start
> webpack serve -c ./buildScripts/webpack/webpack.server.config.js --open

<i> [webpack-dev-server] Project is running at:
<i> [webpack-dev-server] Loopback: http://localhost:8080/
<i> [webpack-dev-server] On Your Network (IPv4): http://192.168.1.159:8080/
<i> [webpack-dev-server] On Your Network (IPv6): http://[fe80::1]:8080/
<i> [webpack-dev-server] Content not from webpack is served from '/Users/dave/Projects/sandpit/failing-js/neo' directory
<i> [webpack-dev-middleware] wait until bundle finished: /
asset main.js 125 KiB [emitted] [minimized] (name: main) 1 related asset
runtime modules 27.1 KiB 13 modules
orphan modules 13.8 KiB [orphan] 7 modules
cacheable modules 197 KiB
  modules by path ./node_modules/webpack-dev-server/client/ 50.8 KiB
    modules by path ./node_modules/webpack-dev-server/client/modules/ 30.2 KiB 2 modules
    3 modules
  modules by path ./node_modules/webpack/hot/*.js 4.3 KiB 4 modules
  modules by path ./node_modules/html-entities/lib/*.js 81.3 KiB 4 modules
  modules by path ./node_modules/url/ 37.4 KiB 3 modules
  modules by path ./node_modules/querystring/*.js 4.51 KiB 3 modules
  ./src/index.js 272 bytes [built] [code generated]
  ./node_modules/ansi-html-community/index.js 4.16 KiB [built] [code generated]
  ./node_modules/events/events.js 14.5 KiB [built] [code generated]
webpack 5.53.0 compiled successfully in 1923 ms
```

...then navigating to http://localhost:8080/apps/sharedcovidgallery yields the above error.

My guess is something to do with Chrome 93 is preventing workers from properly starting?

## Timeline

### @tobiu - 2021-09-20T23:05:04Z

Welcome to the neo community @davewthompson!

sharedcovidgallery is actually not a valid starting point on its own:
https://github.com/neomjs/neo/blob/dev/apps/sharedcovidgallery/MainContainer.mjs

This app literally just contains an empty viewport.

you can open: http://localhost:8080/apps/sharedcovid/ which will render the entire covid app.

From there, you can navigate to the gallery tab and then click on the window button on the top right. This will move the component of the gallery view into a new popup window:

![Screenshot 2021-09-21 at 00 53 34](https://user-images.githubusercontent.com/1177434/134086985-859be2d7-b1c7-4baf-a9c4-cd48390a0dcc.png)

Alternatively, you can open http://localhost:8080/apps/sharedcovid/ in one browser window and once the app is rendered, navigate to the gallery and then open http://localhost:8080/apps/sharedcovidgallery inside a different browser window:

![Screenshot 2021-09-21 at 00 57 28](https://user-images.githubusercontent.com/1177434/134087338-5ba60e80-77fc-4e8e-8430-dae967b20d15.png)

To see the SharedWorkers, you need to open: chrome://inspect/#workers
and then inspect the app worker.

I personally strongly recommend to start with apps, which are not SharedWorkers based, but use normal ones (which you can inspect directly inside the browser console).

In case you want to create a multi screen app, you can also start with dedicated workers and later on switch to SharedWorkers at any point (just add `"useSharedWorkers": true` into the neo-config.json of your app).

I actually was not able to see your console error. In case I open sharedcovidgallery as a starting point, I did see an error flickering for a brief moment. Too fast to even read it.

Feel free to join the Slack Channel.

Best regards,
Tobias

- 2021-09-20T23:13:27Z @tobiu referenced in commit `87bdd83` - ""Manager.mjs:384 Uncaught Error: Called sendMessage for a worker that does not exist: canvas" when trying samples #2739"
### @tobiu - 2021-09-20T23:14:30Z

added the checks for existing workers into the broadcast method:
```
    broadcast(msg) {
        Object.keys(this.workers).forEach(name => {
            if (!(
                name === 'canvas' && !NeoConfig.useCanvasWorker ||
                name === 'vdom'   && !NeoConfig.useVdomWorker
            )) {
                this.sendMessage(name, msg);
            }
        });
    }
```

- 2021-09-20T23:14:30Z @tobiu closed this issue
### @tobiu - 2021-09-20T23:21:22Z

I should add, that you can take a look at:
https://github.com/neomjs/neo/tree/dev/examples/component

there are standalone examples for the gallery & helix (using covid data or images) in here.
those are not shared workers based.

e.g.:
http://localhost:8080/examples/component/coronaGallery/



### @davewthompson - 2021-09-20T23:38:53Z

Thank you very much for your response! All makes sense and is working now. Cheers!


