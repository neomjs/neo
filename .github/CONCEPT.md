# neo.mjs concepts
This Concepts / Introduction guide is intended for new users who have read the "buzz-word" table on the
<a href="../README.md">Main Readme File</a> and would like to learn more before following the
<a href="./GETTING_STARTED.md">Getting Started Guide</a>.

This file is a work in progress, I will close #258 once done.

## Content
1.  <a href="#worker-setup">Worker Setup</a>

## Worker Setup
The framework is using 4 threads by default:
1. top (Main): Creating the workers, manipulating the real DOM, forwarding UI events to App
2. App: Most parts of the framework & your apps live here
3. Data: Responsible for the BE connections
4. Vdom: Converting the virtual DOM into HTML, as well as calculating delta updates

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

### What is the reason to use multiple threads?
As you know, (almost) all computers and mobile devices have several cores / CPUs.
By default, browsers will only use one of them.
This means that in case a lot is going on inside your App UI one CPU could go up to 100%, your animations get laggy or
your UI might even freeze, while the other CPUs are idle.
To ensure this does not happen you want to keep the Main thread as idle as possible.

To quote the <a href="./STORY.md">neo.mjs Story</a>:

> In case you take a look at the <a href="https://en.wikipedia.org/wiki/Web_worker">web workers page on Wikipedia</a>,
you will find the following quote:
>
> **"The simplest use of workers is for performing a computationally expensive
task without interrupting the user interface."**
>
>At this point, all other web-based UI frameworks are still struggling with performance,
especially in case you are building big apps. There are many hidden background tasks running
which can slow down your beautiful animations or even worse: single threaded applications can have memory
leaks resulting in browser-freezes after using them for a while (either the one and only core which is used
runs at 100% or the memory usage gets too extreme).
>
>Looking back at the Wikipedia quote, Rich Waters & I came to the conclusion that the most expensive tasks are
the framework & the apps itself.
>
>So we asked ourselves the question:<br/>
**"What if a framework & all the apps you build would run inside a separate thread?"**
>
>With this idea, the neo.mjs project was born.

