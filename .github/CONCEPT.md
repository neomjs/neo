# neo.mjs concepts
This Concepts / Introduction guide is intended for new users who have read the "buzz-word" table on the
<a href="../README.md">Main Readme File</a> and would like to learn more before following the
<a href="./GETTING_STARTED.md">Getting Started Guide</a>.

This file is a work in progress, I will close #258 once done.

## Content
1.  <a href="#worker-setup">Worker Setup</a>

## Worker Setup
The framework is using 4 threads by default:
1. top (Main)
2. App
3. Data
4. Vdom

The best way to get a feeling for workers is using the Google Chrome Dev Tools (Console).

In case you open the <a href="https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/docs/index.html">neo.mjs Docs App</a>
(or any other neo.mjs app), you will get a dropdown menu where you can pick the console scope:

<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/concept/worker_scope.png">

The default scope (top) will show the (console) logs inside all threads.

Most parts of the neo.mjs framework as well as the apps which you create will run within the App thread.

***Hint:*** Type Neo and hit return inside the default view (top). You will see the parts of Neo which are used inside the main
thread. Neo.component won't exist here. Now use the dropdown and switch into the App thread. Type Neo and hit return again.
Now you will see a completely different version of the Neo namespace object. Neo.component will exist here and you can
use methods like Neo.getComponent('myId') directly.