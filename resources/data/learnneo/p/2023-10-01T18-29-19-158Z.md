Neo.mjs is a framework used to create browser-based applications.

Some key features and benefits of Neo.mjs are:

<div type="expander" caption="Multi-Threaded">
<p>
When a Neo.mjs application starts, the framework spawns three web-workers. 
Web-workers are each run in their own thread. As a result, a typical Neo.mjs application
has four threads:
<ol>
<li>The _main_ thread, where DOM updates are applied
<li>An _application_ web-worker where normal application locic is run
    <li>A _data_ web-worker were HTTP and socket calls are run
<li>A _view_ web-worker that manages delta updates
</ol>
</div>

<div type="expander" caption="Extreme Speed">
<p>
The Neo.mjs web-worker proccesses are automatically run in parallel, on separate CPU cores.
</p>
<p>
By contrast, other JavaScript frameworks run in a single thread. That means 
in a typical framework all business logic, data handling, and DOM rendering compete for 
CPU reasources.
</p>
<p>
This means Neo.mjs applications run and render faster. This is 
particularly beneficial for processor- and data-intensive applications, 
and applications that need to rapidly update what's viewed. In testing, Neo.mjs applications 
easily apply over 20,000 DOM updates per second. 
</p>
<p>
If the default four threads aren't enough, you're free to launch additional web-worker threads 
to run other specialized logic. 
</p>
</div>

<div type="expander" caption="Quick Application Development">
<p>
Neo.js classes let you specify properties in a way that allows code to detect "before" and "after"
changes. This makes it easy to handle value validation and transformation, and react to changes. 
</p>
<p>
Neo.mjs also has elegant yet powerful state management features that make it easy to create shared,
bindable data. For example, if two components are bound to the same propery, a change to the 
property will automatically be applied to both components.
</p>
</div>

<div type="expander" caption="Multi-Window Applications">
<p>
Neo.mjs applications can also launch as _shared web workers_, which allows you to have a single 
application run in multiple browser windows; those windows could be moved to multiple monitors.
</p>
<p>
For example, you can have a data analysis application with a control panel on one monitor, 
tabular data in another, and charts on another &mdash; all sharing the same data, handling events
across windows, running seamlessly as a single application. 
</p>
</div>

<div type="expander" caption="Open-Source and Standards-Based">
<p>
Neo.mjs is an open-source library. Features needed for the community can be added to the
library via pull-requests. And since Neo.mjs uses the standard JavaScript class system, 
all Neo.mjs classes can be extended.
</p>
<p>
Neo.mjs uses standard modular JavaScript, so developers don't need to learn non-standard language
syntax, and there's no need for special pre-compilers or WebPack modules.
That means fewer dependencies and easier configuration. Furthermore, the use of
standard JavaScript makes debugging easier: any statement you write while developing your
applcation can also be run in the debugging console.
</p>
</div>
