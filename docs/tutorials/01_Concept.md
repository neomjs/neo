#### Why yet another Javascript framework?

1. neo.mjs is web workers driven
2. neo.mjs does not need any cryptic XML markups
3. neo.mjs uses a custom blazing fast virtual dom engine
4. neo.mjs is based on EcmaScript 8 (ES8)
5. neo.mjs uses HTML5 and CSS3 to the fullest
6. Simplicity
7. No transpiled code

____

(1) neo.mjs uses 3 web workers:
* App
* Data
* Vdom

The main reason is that browsers by default only use 1 CPU core, while most computers and mobile devices have
more. Multi-Threading solves this performance bottleneck and it will ensure that there are no hidden
background-tasks in the main thread, which mess with your beautiful animations.

In short: Most parts of neo.mjs as well as all apps you will create are inside the App worker.

The main thread is only responsible to manipulate the DOM and delegate DOM events to the App worker.

The Data worker will perform all Ajax requests to your backend and host the Store instances.

The Vdom worker parses your JSON based markup (Vdom) into a virtual node (Vnode) and creates deltas
when you dynamically change your Vdom.


(2) Did you ever enjoy writing pseudo-html including curly braces like {tpl if}, {tpl for} or even better
{[this.doSomething()]}? Those XML templates evolved to a point, where they try to do everything what
Javascript itself is capable of and you will most likely have encountered scoping issues (where does "this"
point to now?). The solution is as simple as it should have been obvious for quite a while: JSON. You can easily manipulate Javascript objects with Javascript.


(3) Since neo.mjs does not need to parse XML templates back into JSON and then create virtual DOM nodes,
the custom Vdom engine is blazing fast. The algorithms to create deltas are highly efficient and
recognise moved DOM subtrees immediately.


(4) neo.mjs is most likely the first UI framework out there which does not only allow devs to create
ES6 classes on top of ES5 prototypes, but is itself fully written in ES6.


(5) neo.mjs uses the latest web APIs and CSS features to the fullest and give you an easy and intuitive
access to them.


(6) The first and most important design goal of neo.mjs is simplicity. This does not only mean to keep the
code base as clean and simple as possible, but also to keep the created DOM as lightweight and minimal as
possible.

(7) neo.mjs does not use Babel or any other tool to transpile code (which does not mean you can't use it for your own apps).