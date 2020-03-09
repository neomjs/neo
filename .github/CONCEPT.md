# neo.mjs concepts
This Concepts / Introduction guide is intended for new users who have read the "buzz-word" table on the
<a href="../README.md">Main Readme File</a> and would like to learn more before following the
<a href="./GETTING_STARTED.md">Getting Started Guide</a>.

This file is a work in progress, I will close #258 once done.

## Content
1. <a href="#worker-setup">Worker Setup</a>
2. <a href="#no-javascript-builds-(development-mode)">No Javascript Builds (Development Mode)</a>
3. <a href="#no-string-based-pseudo-xml-templates">No string based pseudo XML templates</a>

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

***Summary:*** Since the Main thread is as idle as possible, it is close to impossible that your UI will get laggy
or even freezes. In case a lot is going on on the Javascript side of things, the worst that could happen is that
the App thread runs at 100% which will not affect the Main thread.

## No Javascript Builds (Development Mode)
This probably sounds really old school (pre ES6+ times) at first:

You edit a JS source file, refresh the page and you get your changes right away.
No build process(es), no hot module replacements or whatever.

***Design Goal:*** No transpiled Javascript Code, at least for the Development Mode.

As an example, let's take a quick look at the Gallery inside the Real World App version 2 (early stage, in progress).</br>
This is (the start of) the Gallery source code:
```Javascript
import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Collection}      from '../collection/Base.mjs'
import {default as Component}       from './Base.mjs';
import GalleryModel                 from '../selection/GalleryModel.mjs';
import NeoArray                     from '../util/Array.mjs';
import Store                        from '../data/Store.mjs';

/**
 * @class Neo.component.Gallery
 * @extends Neo.component.Base
 */
class Gallery extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Gallery'
         * @private
         */
        className: 'Neo.component.Gallery',
        /**
         * @member {String} ntype='gallery'
         * @private
         */
        ntype: 'gallery',
        /**
         * The amount of visible rows inside the gallery
         * @member {Number} amountRows_=3
         */
        amountRows_: 3,
        /**
         * The background color of the gallery container
         * @member {String} backgroundColor_='#000000'
         */
        backgroundColor_: '#000000',
        /**
         * @member {String[]} cls=['neo-gallery', 'page', 'view']
         */
        cls: ['neo-gallery', 'page', 'view'],
        /**
         * True disables selection of  gallery items
         * @member {Boolean} disableSelection=false
         */
        disableSelection: false,
        /**
         * The image height of the gallery
         * @member {Number} imageHeight=160
         */
        imageHeight: 160,
        /**
         * The image width of the gallery
         * @member {Number} imageWidth=120
         */
        imageWidth: 120,
        /**
         * @member {Object} itemTpl_
         */
        itemTpl_: {
            cls     : ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            tabIndex: '-1',
            cn: [{
                tag  : 'img',
                cls  : [],
                style: {}
            }]
        },
        /**
         * The unique record field containing the id.
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * The max amount of store items to show
         * @member {Number} maxItems_=300
         */
        maxItems_: 300,
```
<a href="https://github.com/neomjs/neo/blob/dev/src/component/Gallery.mjs">Full component.Gallery Source Code</a>

Now let us take a look at the source code inside the browser:
<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/concept/gallery_workers.png">

Expand the image and take a close look at the Chrome Dev Tools:
1. The source code is 1:1 the same
2. If you look at the left console tab (Page), you will see the 4 threads again.
The Gallery code is inside the App thread.

***Summary:*** The design goal to not transpile Javascript code (at least inside the development mode for now),
has several pros & cons. neo.mjs is the first UI framework to use JS modules inside workers,
which just got enabled in Google Chrome v80+.

Pros:
1. You get an unmatched debugging experience, since you can debug the real code</br>
(no source-maps needed, no webpack interferences etc.)
2. Browsers can cache JS modules and native packaging is in development
3. Your code base is modular

Cons:
1. neo.mjs is not using TypeScript (you could do it for your own app code, in case you want to use a build process)
2. Firefox & Safari do not support JS modules inside workers yet, so the development mode only runs in Chrome v80+.
Of course the dist (dev&prod) versions do run fine in FF & Safari as well.
3. Several npm dependencies can not easily get used, since they do not use a correct ES6 import syntax (e.g. missing file names)

## No string based pseudo XML templates
One example from the <a href="https://reactjs.org/">React Website</a>:
```jsx
  render() {
    return (
      <div>
        <h3>TODO</h3>
        <TodoList items={this.state.items} />
        <form onSubmit={this.handleSubmit}>
          <label htmlFor="new-todo">
            What needs to be done?
          </label>
          <input
            id="new-todo"
            onChange={this.handleChange}
            value={this.state.text}
          />
          <button>
            Add #{this.state.items.length + 1}
          </button>
        </form>
      </div>
    );
  }
```

Everyone has seen template based code like this and... it has to go away!