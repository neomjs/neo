# The neo.mjs story

In case you take a look at the <a href="https://en.wikipedia.org/wiki/Web_worker">web workers page on Wikipedia</a>,
you will find the following quote:

**"The simplest use of workers is for performing a computationally expensive
task without interrupting the user interface."**

At this point, all other web-based UI frameworks are still struggling with performance,
especially in case you are building big apps. There are many hidden background tasks running
which can slow down your beautiful animations or even worse: single threaded applications can have memory
leaks resulting in browser-freezes after using them for a while (either the one and only core which is used
runs at 100% or the memory usage gets too extreme).

Looking back at the Wikipedia quote, Rich Waters & I came to the conclusion that the most expensive tasks are
the framework & the apps itself.

So we asked ourselves the question:<br/>
**"What if a framework & all the apps you build would run inside a separate thread?"**

With this idea, the neo.mjs project was born.

We already had a proof of concept running in October 2015, which was using 4 threads:
1.  Main (Creating the workers, manipulating the real DOM, forwarding UI events to App)
2.  App (Most parts of the framework & your apps live here)
3.  Data (Responsible for the BE connections)
4.  Vdom (Converting the virtual DOM into HTML, as well as calculating delta updates)

It was a rough time for workers, since there were no console logs possible.
Catching errors without any info which file or line number caused it was painful,
but we got it running in the first version (ES5 based) of the framework.

The project got a new momentum, once the Chrome flag was released, which made it possible
to use JS modules directly inside workers (imports). I created a second version of the framework at this point,
which is now fully based on top of ES8.

**Obviously, there is a lot more to neo.mjs:**

We do believe that string based templates need to go away
1.  Converting strings containing variables and method calls into JSON structures is expensive
2.  Scoping can be a nightmare
3.  You are not in control on how templates get parsed (e.g. when you want to change multiple variables)
4.  Some other frameworks are now parsing templates inside the build processes, which is just working **around**
the real problem: it limits you to only create simple components with a few states or you can end up with a
**massive** overhead on the app side.

Our solution was to use JS based objects / arrays (JSON) for the virtual DOM structure.

It is kind of obvious, that you can easily manipulate JS objects & arrays any way you want using JS.<br/>
No more scoping issues.<br/>
You are in full control when, what and how to change your vdom.

The neo.mjs vdom structures are not "templates", which get consumed when rendering or mounting a component,<br/>
but persist throughout the full component lifecycle.<br/>
Meaning: you can easily change them the same way at any given point.

Especially when creating big apps, many framework fail to provide you with a robust and solid base structure,
on which you can build complex UI architectures. Extensibility is another huge issue.

The neo.mjs config system solves this. You can use configs exactly the same way when passing them first to create
an instance or later on when changing them. Simplicity at its finest:
you don't even need to remember setter method names.

Example:
```
const myButton = Neo.create(Button, {text: "Hello"});

// this will already update the UI and yes, you can do this inside the console as well
myButton.text = "World";
```

For more input on what you can do using neo.mjs, please take a look at the guides inside the docs app.

# The neo.mjs vision

At this point I can not commit to adding dates to the planned items.
After investing 1.5 years of my full and unpaid working time I am in need to make up on the financial side of things.

To speed up the current development there are two options:
1. Help promoting neo.mjs or jump in as a contributor (see <a href="../CONTRIBUTING.md">Contributing</a>)
2. Jump in as a sponsor to ensure I can spend more time on the neo.mjs coding side (see <a href="../BACKERS.md">Sponsors & Backers</a>)

The following items are **not** ordered by priority. In case certain topics are important to you, please use the issues
tracker to create an awareness (like / comment on current tickets or create new ones as needed).

Thanks for your support!

* Real World app version 2
    1. Version 1 is definitely worth a look to see how to craft custom components and connect to an API,
    but it is not the best starting point to see how to craft an neo.mjs app. Since the requirement was to use a given
    Bootstrap theme, only component.Base is in use (since more advanced components require a neo.mjs CSS theme).
    At this point I recommend to take a look at the Docs app to learn how to craft an neo.mjs app.
    2. Version 2 is intended to fill this gap and will not use the Bootstrap based theme.
    3. This allows us to use the full range of neo.mjs components (Toolbar, Button, List, TabContainer, Helix, etc.)
    4. Once this app is finished, it will be the perfect starting point to learn how to use neo.mjs,
    so right now this item has the highest priority for me.
* Drag & Drop (see <a href="https://github.com/neomjs/neo/issues/16">#16</a>)
    1. This ticket is definitely an epic, since DD operations happen inside the main thread, while the handlers will
    live inside the app thread.
    2. Once DD is in place, we can create a real slider component (see <a href="https://github.com/neomjs/neo/issues/18">#18</a>)
    3. We can create Dialogs (Windows), which can get moved and resized (see <a href="https://github.com/neomjs/neo/issues/15">#15</a>)
    4. We can create sortable tabs (<a href="https://github.com/neomjs/neo/issues/23">#23</a>)

Copyright (c) 2015 - today, Tobias Uhlig & Rich Waters