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

The neo.mjs vdom structures are not "templates", which get consumed when rendering or mounting a component,
but persist throughout the full component lifecycle. Meaning: you can easily change them the same way at
any given point.

Especially when creating big apps, many framework fail to provide you with a robust and solid base structure,
on which you can build complex UI architectures. Extensibility is another huge issue.

The neo.mjs config system solves this. You can use configs exactly the same way when passing them first to create
an instance or later on when changing them. Simplicity at its finest:
you don't even need to remember setter method names.

Example:
```
const myButton = Neo.create(Button, {text: "Hello"});

myButton.text = "World"; // this will already update the UI and yes, you can do this inside the console as well
```

# The neo.mjs vision

content coming soon!

Copyright (c) 2015 - today, Tobias Uhlig & Rich Waters