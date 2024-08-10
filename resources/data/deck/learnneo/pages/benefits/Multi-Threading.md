## How many Cores are on a Computer or Smartphone?
In case you are using a Mac, you can click on the top-left Apple Icon,
then on "About this Mac" and it will show you something like:

> Processor 3,2 GHz 8-Core Intel Xeon W
 
With the Apple silicon series even more: "Apple M2 Ultra" provides 24 CPU cores.

An iPhone has 6 CPU cores.

TL-BR: Every computer or smartphone has several cores available.

This means that you can run multiple threads in parallel.

> Would you build a car using just one engine cylinder?

If your answer is "Of course not! It would be way slower!",
then you should read this article carefully.

## How many Cores does a Browser use?

On its own, a Browser will just use ***one*** core per tab / window.

Meaning: your Angular or React apps look like this:

![Current State of Apps](https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/apps-today.png)

The more JavaScript tasks are running inside your app, the slower it will get.
The worst scenario is a complete UI freeze where your one core is at 100%
and all other cores are completely idle.

This is ***not*** scalable at all.

_[Side note] In case you are creating simple, small and rather static websites or apps, this setup can be sufficient._

## Web Workers API

> Web Workers makes it possible to run a script operation in a background thread separate from the main execution thread
> of a web application. The advantage of this is that laborious processing can be performed in a separate thread,
> allowing the main (usually the UI) thread to run without being blocked/slowed down.

Source: <a target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API">MDN: Web Workers API</a>

> The W3C and WHATWG envision web workers as long-running scripts that are not interrupted by scripts that respond to
> clicks or other user interactions. Keeping such workers from being interrupted by user activities should allow
> Web pages to remain responsive at the same time as they are running long tasks in the background.
> 
> The simplest use of workers is for performing a computationally expensive task without interrupting the user interface.

Source: <a target="_blank" href="https://en.wikipedia.org/wiki/Web_worker">Wikipedia: Web worker</a>

So, while JavaScript itself is single-threaded as a language, using workers enables us to use multiple cores in
parallel and end this scalability nightmare.

Let the following quote really sink in:
> The simplest use of workers is for performing a computationally expensive task without interrupting the user interface.

It leads to the question: "What is the most expensive task?"

The answer is simple: "An UI Framework or Library itself as well as the apps we build with it."

This is leading to the idea: Let us move everything we can out of the main thread,
so that this one can purely focus on what it is intended to do: manipulating the DOM.

In case your apps are no longer running in main, there is nothing left which can slow down or block your UI or create memory leaks.

This thought is leading to the following concept:

## The "An Application Worker being the Main Actor" Paradigm
To resolve this performance bottleneck, we want to get main threads as idle as possible, so that they can fully focus on
rendering / dynamically manipulating the DOM:

![App Worker Concept](https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/app-worker.png)

The worst case that could happen now is that your app worker will slow down and this core runs at 100%. However,
this will not affect your UI (rendering thread → main).

Probably the best solution for single page apps (SPAs) looks like this:

<pre data-neo-component>
{
    "cls" : "neo-worker-setup",
    "tag" : "element-loader",
    "vdom": {"src": "../../resources/images/workers-focus.svg"}
}
</pre>
