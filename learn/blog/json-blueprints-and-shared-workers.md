# How JSON Blueprints & Shared Workers Power Next-Gen AI Interfaces

**Unlocking Multi-Window Generative AI with the Innovative Architecture of Neo.mjs**

<p align="center">
  <a href="https://youtu.be/yMCWpJFh7g4"><img width="600px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image1.png" alt="Current State of the Neo.mjs Website (YouTube Video)"></a>
</p>

---

## 1. The Build Tool Blues: When Web Development Feels Like a Bottleneck

Generative AI promises to unlock unprecedented creativity and efficiency, but bringing those powerful AI outputs to life
in the browser often feels like fighting an uphill battle against our own tools. We’re caught in a cycle: we spend precious
development time configuring complex bundlers like Webpack or Vite, waiting for builds, and wrestling with hot module
reloading (HMR) that often feels more like a slow burn than a hot refresh.

This constant friction stifles creativity and slows down the iterative process essential for AI-driven development.
Is this really the future of web development, eternally bound to build tools in dev mode?

## 2. A Glimpse of the Future: The Zero-Build Development Experience

Imagine this: you hit save, and your changes appear instantly in the browser. No bundler spinning, no transpilation step,
no HMR dance. Just pure, unadulterated JavaScript modules loaded directly by the browser.

This isn’t a dream. It’s the zero-build development mode in Neo.mjs.

From day one, Neo.mjs was designed to work directly with ES Modules. In development, your browser loads each .mjs file
individually, exactly as it's written. This means:

- **Instant Start-up:** No lengthy compilation step when you fire up your dev server.
- **True Hot Reloads:** Changes propagate immediately because the browser just re-fetches the specific module that changed.
- **Unprecedented Transparency:** You’re working directly with the code that runs in the browser, without any build-timetransformations obscuring the view.
- **Simplified Debugging:** Your debugger sees the exact files you’re writing, making breakpoints and inspections incredibly straightforward.

This capability fundamentally changes the developer experience, freeing you from build tool overhead and letting you
focus on building features, not fighting configurations. Most developers are unaware this level of direct browser
interaction is even possible for complex applications, but Neo.mjs proves it is.

https://neomjs.com/apps/portal/#/home
<br>(Obviously, we do not want to use a service worker here.)

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image2.webp" alt="dev mode">
<br><br>
<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image3.webp" alt="dev mode console">

This is 1:1 the code that we write, no source maps needed.

## 3. The Production Paradox: When Zero-Build Hits the Real World

While the zero-build dev mode is liberating, the real world (and traditional production deployments) presents a paradox.
For years, the rationale for bundling for production has been ironclad:

- **Network Overhead:** Too many small files mean too many HTTP requests, leading to slow waterfalls and increased latency over HTTP/1.1 and even HTTP/2 (due to Head-of-Line blocking at the TCP layer).
- **Compression Efficiency:** Bundling allows for better overall compression (e.g., Brotli) as the algorithm has a larger context to work with.
- **Minification & Tree-Shaking:** Bundlers excel at removing dead code and minifying across entire codebases for smallest possible payloads.

So, for production, Neo.mjs adopted a pragmatic approach: a traditional bundler (via Webpack) to create highly optimized,
single-file bundles for all deployed apps. This provided excellent performance for typical web applications.

However, this traditional bundling approach creates a significant challenge for specialized use cases, specifically for
building something like a code editor (like Monaco) or a multi-window Generative AI interface. Trying to bundle an
entire IDE, with all its language services and dynamic features, into a single file quickly becomes impossible or
results in an unusable, gigantic payload.

It forced a hybrid mix: some parts bundled, others dynamically loaded. This works, but it introduces complexity and
overhead, taking away some of the elegance of the zero-build dev experience.

https://neomjs.com/dist/production/apps/portal/#/home
<br>(Service worker in place, from the 2nd page load onwards, content gets almost created instantly)

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image4.webp" alt="dist/production">

Since the application worker is the main actor, it is more helpful to open the matching cross window console:
`chrome://inspect/#workers` (click on the neomjs-appworker entry).

The tricky part is that inside our code editors, we can literally import anything.

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image5.webp" alt="monaco editor — dist/production">

Let us change “multiWindowHelix” into “multiWindowCoronaGallery”:

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image6.webp" alt="monaco editor — Gallery — dist/production">

Bundling arbitrary imported modules is close to impossible, since it would require us to create bundles for all
possible module combinations. The bundle numbers get astronomical.

Looking into the appworker console explains how it works:

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image7.webp" alt="appworker console — dist/production">

You can see the `dist/production` folder which contains the bundles (chunks) for everything that can get bundled,
but also the dev mode examples and src folders.

The hybrid strategy is even simpler than sandboxing. Every neo class ends the following way:
`export default Neo.setupClass(Button);`. We are not exporting the class directly, but the return value of `setupClass()`.
This method will check if the given namespace => className already exists, and if so return that module instead.
First required env wins for each module. This can create quite the overhead for not used duplicated modules.

To be fair: only highly dynamic use cases can not get bundled (e.g. complex CMS, CRM, UI builders like form generators,
and especially code editors with live previews).

## 4. The HTTP/3 Revolution: Rethinking Network Performance

This is where the next major shift in web technology comes into play. As detailed in resources like the
[“QUIC and HTTP/3: The Next Step in Web Performance”](https://javascript-conference.com/blog/quic-and-http-3-the-next-step-in-web-performance-2/) article,
HTTP/3 fundamentally changes how web resources are transmitted.

-   **Eliminating Head-of-Line (HOL) Blocking:** Unlike HTTP/1.1’s sequential requests or HTTP/2’s single-connection
    HOL blocking, HTTP/3 (built on QUIC) uses independent UDP streams. If one packet is lost, it only affects that single
    stream, not all concurrent streams. This means fetching many small files simultaneously is no longer a bottleneck.
-   **Faster Connection Establishment:** QUIC combines the TCP and TLS handshakes, drastically reducing the latency to
    establish a secure connection, especially for repeated visits (0-RTT).
-   **Connection Migration:** Seamlessly switch between networks without dropping connections.

The impact of HTTP/3 is profound: it significantly reduces the “cost” of making multiple HTTP requests.
This directly challenges the primary historical argument for bundling everything together. If fetching 100 small files
is now as efficient as (or more efficient than) fetching one large bundle, what does that mean for our build processes?

It opens the door for a truly modern, modular production strategy.

> Don’t worry about bundling; request count doesn’t really matter any more, and larger numbers of small requests are easier
> for the browser to cache and manage. Think of webpack as an antipattern!

## 5. dist/esm: Fueling Modularity and On-Demand Experiences for the HTTP/3 Era

This is precisely why Neo.mjs just introduced its `dist/esm` environment. Leveraging HTTP/3's capabilities, `dist/esm`
is a radical rethinking of the production build:

-   **No Bundling:** We embrace the browser’s native ES Module loader. Each component, each utility,
    each Neo.mjs class exists as its own minified `.mjs` file.
-   **Individual File Minification:** Instead of a giant bundle, each file is minified on its own, ensuring optimal size.
-   **True Dynamic Imports:** This enables Neo.mjs to dynamically import any ES module at runtime — be it a new component
    type, a specific view model, a utility function, or a third-party library’s module. If an AI generates a configuration
    for a UI element the client hasn’t encountered yet, Neo.mjs can fetch its specific module on-demand.
-   **Addressing Worker Limitations:** As previously highlighted, this setup works perfectly with Web Workers
    (which are central to Neo.mjs’s architecture) because it uses full, explicit paths for imports, respecting current
    browser limitations around import maps within workers.

The `dist/esm` approach combines the developer experience benefits of zero-build with a production strategy that perfectly
aligns with HTTP/3. It's about serving just what's needed, exactly when it's needed, with minimal network overhead.

Before we dive into the online demo, a fair warning: neomjs.com is currently hosted via GitHub Pages, and they do not
support HTTP/3 yet.

⚠️ **Note:** GitHub Pages remains viable for Neo.mjs, but HTTP/3-dependent optimizations require alternative hosting for now.

[Online Demo (dist/esm)](https://neomjs.com/dist/esm/apps/portal/#/home)

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image8.webp" alt="dist/esm">

Let us take a look into the appworker console again: `chrome://inspect/#workers`:

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image9.webp" alt="app worker console — dist/esm">

As you can see, we now get both apps => colors and portal served from `dist/esm`. The exact same way like the dev mode works.
No more hybrid envs overhead.

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image10.webp" alt="app worker — dist/esm — service worker based caching">

Unlike to the dev mode, we of course want to use the service worker here.

This concept creates the foundation for multi-window Gen AI interfaces.

## 6. The Paradigm Shift: JSON Blueprints vs. HTML Streaming for Dynamic Applications

The quest for faster perceived performance and improved SEO has rightly pushed Server-Side Rendering (SSR) and HTML
streaming to the forefront for many web applications, especially content-centric websites. But for highly interactive,
stateful applications — particularly the dynamic, multi-faceted interfaces demanded by Generative AI — is streaming
pre-rendered HTML fragments the ultimate endgame?

### A Lesson from History: Why JSON Won the API War

We’ve seen this movie before. XML was once the verbose, heavyweight standard for data interchange across the web.
Then, JSON emerged and rapidly became dominant for APIs due to its lighter weight, simpler parsing, native JavaScript
compatibility, and overall developer ergonomics. It was simply a more efficient, pragmatic way to communicate structured data.

Neo.mjs posits a similar evolution for instructing rich client applications.

### Neo.mjs’s Proposition: UI Defined by JSON, Not Transmitted as HTML

Instead of the server laboring to render and stream HTML, it transmits highly optimized JSON “blueprints.”
These blueprints are precisely the declarative UI definitions we explored earlier — compact, structured descriptions of the component tree, their interrelations, configurations, and initial state. Think of it as the server sending the architectural plans, not pre-fabricated walls.

The client-side Neo.mjs engine (powered by its dedicated or shared App Worker and other workers) receives these JSON blueprints.
It then acts as an intelligent factory, efficiently instantiating the necessary JavaScript component instances (fetching
their ES modules via the Service Worker if needed) and constructing the live, interactive UI.

**Advantages for Gen AI & Complex Apps:**
-   **Extreme Data Efficiency:** JSON blueprints are drastically smaller than their HTML counterparts, leading to minimal
    data transfer.
-   **Server De-Loading:** This approach offloads rendering stress from the server, freeing it for core application logic,
    data provision, and intensive AI computations.
-   **AI’s Native Language:** Generative AIs can more easily and reliably produce, understand, and manipulate structured
    JSON than they can craft nuanced HTML templates or manage streaming protocols. This makes AI-driven UI generation far
    more direct and robust.
-   **Superior Reactivity & Granularity:** State changes can be communicated via small JSON patches or updated configurations,
    allowing the persistent client-side JS components to perform surgical DOM updates. This is often far more efficient
    than re-streaming HTML sections.
-   **True Separation:** The server provides the “what” (the UI blueprint as JSON); the client expertly handles the “how”
    (rendering, interactivity, state management).

## 7. Practical SSG Examples

### Dynamic header items

The server-side generation (SSG) topic came up, when a company focussing on backend solutions reached out,
asking how to best control and work with Neo.mjs UIs.

As a first thought, a backend could create custom JS modules on it’s own. However, how would we bundle this with Webpack
or Vite? In a way, we would need separate apps for each module permutation, and this did not sound like a smart approach.

Let us step back even more: You might be wondering why a fat-client based frontend framework could even need SSG.
After all, we can easily update and adjust everything on the client at run-time. The power of a declarative and reactive
configuration system.

A very simple example → A page header:

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image11.webp" alt="page header toolbar">

In most real world apps, there would be different actions for not logged in users, and for different user roles
(e.g. normal user versus admin). We would use a `state.Provider`, drop in an array of user roles, bind it to the
`header.Toolbar` and have a tiny client-side logic, to add or remove action buttons as needed.
Or alternatively just show or hide them.

But what happens, in case there are 100+ different user roles, and suddenly the required update logic gets huge?
At some trade-off point, it can make more sense to just ask the backend what the content items should be.

Let us take a look into a deployed example:
[Toolbar Items Example](https://neomjs.com/dist/esm/examples/serverside/toolbarItems/)

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image12.webp" alt="empty header toolbar">

Click the button:

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image13.webp" alt="header toolbar with SSG items">

Code:

```javascript readonly
import BaseViewport from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';
import Toolbar      from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.serverside.toolbarItems.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.serverside.toolbarItems.Viewport',
        cls      : ['neo-serverside-toolbaritems-viewport'],
        layout   : 'base',

        items: [{
            module   : Toolbar,
            reference: 'toolbar'
        }, {
            module : Button,
            handler: 'up.onLoadItemsButtonClick',
            style  : {marginTop: '1em'},
            text   : 'Load Toolbar Items'
        }]
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onLoadItemsButtonClick(data) {
        data.component.disabled = true;

        let items = await this.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'});

        this.getReference('toolbar').add(items)
    }
}

export default Neo.setupClass(Viewport);
```

The `loadItems()` logic is rather trivial:
```javascript readonly

import Component  from '../component/Base.mjs';

/**
 * @class Neo.container.Base
 * @extends Neo.component.Base
 */
class Container extends Component {
    static config = {
        /**
         * @member {String} className='Neo.container.Base'
         * @protected
         */
        className: 'Neo.container.Base',

        // ...
    }

    // ...

    /**
     * Load items from a remote endpoint.
     * See: https://github.com/neomjs/neo/tree/dev/examples/serverside
     * The response should return a JSON file in the following format:
     * {"modules": [], "items": []}
     * See: https://github.com/neomjs/neo/blob/dev/examples/serverside/gridContainer/resources/data/grid-container.json
     * It is important to add modules which are not already imported inside your app yet.
     * @param {Object} data
     * @param {Object} [data.options={}]
     * @param {String} data.url
     * @returns {Promise<Object[]>}
     */
    async loadItems({options={}, url}) {
        let response   = await fetch(url, options),
            remoteData = await response.json();

        if (remoteData.modules?.length > 0) {
            await Promise.all(remoteData.modules.map(modulePath => {
                // Adjust relative URLs
                if (!modulePath.startsWith('http')) {
                    modulePath = (Neo.config.environment === 'development' ? '../../' : '../../../../') + modulePath
                }

                return import(/* webpackIgnore: true */ modulePath)
            }))
        }

        return remoteData.items
    }
}

export default Neo.setupClass(Container);
```
For simplicity, we just point to a static json file (this would be a backend endpoint):
```json readonly
{
    "items": [{
        "minWidth": 60,
        "route"   : "/home",
        "text"    : "Neo.mjs"
    }, "->", {
        "text" : "Learn",
        "route": "/learn"
    }, {
        "text" : "Blog",
        "route": "/blog"
    }, {
        "text" : "Examples",
        "route": "/examples"
    }, {
        "text" : "Services",
        "route": "/services"
    }, {
        "iconCls": "fa-brands fa-github",
        "url"    : "https://github.com/neomjs/neo",
        "tooltip": {
            "html"     : "GitHub",
            "showDelay": 0,
            "hideDelay": 0
        }
    }, {
        "iconCls": "fa-brands fa-slack",
        "url"    : "https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA",
        "tooltip": {
            "html"     : "Join Slack",
            "showDelay": 0,
            "hideDelay": 0
        }
    }, {
        "iconCls": "fa-brands fa-discord",
        "url"    : "https://discord.gg/6p8paPq",
        "tooltip": {
            "html"     : "Join Discord",
            "showDelay": 0,
            "hideDelay": 0
        }
    }]
}
```
=> We just describe the items by relevant properties, not as HTML.

### Loading an entire Grid definition, including data

Online Demo: [Grid Container Example](https://neomjs.com/dist/esm/examples/serverside/gridContainer/)
<br><br>
<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image14.webp" alt="empty parent container">

<img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/jsonblueprints/image15.webp" alt="remotely loaded grid">

```javascript readonly

import BaseViewport from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';

/**
 * @class Neo.examples.serverside.gridContainer.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.serverside.gridContainer.Viewport',
        cls      : ['neo-serverside-gridcontainer-viewport'],
        layout   : 'base',

        items: [{
            ntype    : 'container',
            cls      : 'neo-serverside-gridcontainer-content',
            layout   : 'fit',
            reference: 'container'
        }, {
            module : Button,
            handler: 'up.onLoadGridContainerButtonClick',
            style  : {marginTop: '1em'},
            text   : 'Load Grid Container'
        }]
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onLoadGridContainerButtonClick(data) {
        data.component.disabled = true;

        let items = await this.loadItems({url: '../../examples/serverside/gridContainer/resources/data/grid-container.json'});

        this.getReference('container').add(items)
    }

    /**
     * @param {Object} data
     * @param {String} data.value
     * @returns {String}
     */
    rendererGithubId({value}) {
        return `<i class='fa-brands fa-github'></i> ${value}`
    }
}

export default Neo.setupClass(Viewport);
```

```json readonly
{
    "modules": [
        "src/grid/Container.mjs"
    ],

    "items": [{
        "className": "Neo.grid.Container",
        "store"    : {
            "keyProperty": "githubId",

            "model" : {
                "fields": [{
                    "name": "country",
                    "type": "String"
                }, {
                    "name": "firstname",
                    "type": "String"
                }, {
                    "name": "githubId",
                    "type": "String"
                }, {
                    "name": "lastname",
                    "type": "String"
                }]
            },

            "data": [{
                "country"  : "Germany",
                "firstname": "Tobias",
                "githubId" : "tobiu",
                "lastname" : "Uhlig"
            }, {
                "country"  : "USA",
                "firstname": "Rich",
                "githubId" : "rwaters",
                "lastname" : "Waters"
            }, {
                "country"  : "Germany",
                "firstname": "Nils",
                "githubId" : "mrsunshine",
                "lastname" : "Dehl"
            }, {
                "country"  : "USA",
                "firstname": "Gerard",
                "githubId" : "camtnbikerrwc",
                "lastname" : "Horan"
            }, {
                "country"  : "Slovakia",
                "firstname": "Jozef",
                "githubId" : "jsakalos",
                "lastname" : "Sakalos"
            }, {
                "country"  : "Germany",
                "firstname": "Bastian",
                "githubId" : "bhaustein",
                "lastname" : "Haustein"
            }]
        },

        "columnDefaults": {
            "width": 200
        },

        "columns": [
            {"dataField": "firstname", "text": "Firstname"},
            {"dataField": "lastname",  "text": "Lastname"},
            {"dataField": "githubId",  "text": "Github Id", "renderer": "up.rendererGithubId"},
            {"dataField": "country",   "text": "Country"}
        ],

        "wrapperStyle": {
            "height": "250px"
        }
    }]
}
```

* This one is already way more interesting.
* We can not (and want not to) serialize imported modules into JSON, so we just pass the related import path as a string.
* We can also not pass functions, so we pass "renderer”: “up.renderGitHubId” and host the method inside the parent module or a view controller.
* If the store for the grid is the same, we could further reduce the already tiny file-size
* We should also give the store a remote endpoint url for loading data, but as you can see we can include the initial data directly to save one roundtrip call.

Just for fun: How would it look like if we would load the required HTML instead?

```html readonly
<div class="neo-serverside-gridcontainer-content neo-container neo-layout-fit" id="neo-container-1"
     data-ref="container">
    <div style="height:250px;" class="neo-grid-wrapper neo-layout-fit-item" id="neo-grid-container-1__wrapper">
        <div class="neo-grid-container" id="neo-grid-container-1" aria-rowcount="8" role="grid">
            <div class="neo-grid-header-toolbar neo-toolbar neo-flex-container neo-flex-align-center neo-flex-direction-row neo-flex-pack-start neo-flex-wrap-nowrap"
                 id="neo-grid-header-toolbar-1" aria-rowindex="1" role="row">
                <button style="width:200px;flex:0 1 auto;"
                        class="neo-grid-header-button neo-button icon-right neo-sort-hidden neo-draggable"
                        id="neo-grid-header-button-1" type="button" role="columnheader" aria-colindex="1"><span
                        class="neo-button-glyph fa fa-arrow-circle-up" id="neo-vnode-3"></span><span
                        class="neo-button-text" id="neo-grid-header-button-1__text">Firstname</span></button>
                <button style="width:200px;flex:0 1 auto;"
                        class="neo-grid-header-button neo-button icon-right neo-sort-hidden neo-draggable"
                        id="neo-grid-header-button-2" type="button" role="columnheader" aria-colindex="2"><span
                        class="neo-button-glyph fa fa-arrow-circle-up" id="neo-vnode-4"></span><span
                        class="neo-button-text" id="neo-grid-header-button-2__text">Lastname</span></button>
                <button style="width:200px;flex:0 1 auto;"
                        class="neo-grid-header-button neo-button icon-right neo-sort-hidden neo-draggable"
                        id="neo-grid-header-button-3" type="button" role="columnheader" aria-colindex="3"><span
                        class="neo-button-glyph fa fa-arrow-circle-up" id="neo-vnode-5"></span><span
                        class="neo-button-text" id="neo-grid-header-button-3__text">Github Id</span></button>
                <button style="width:200px;flex:0 1 auto;"
                        class="neo-grid-header-button neo-button icon-right neo-sort-hidden neo-draggable"
                        id="neo-grid-header-button-4" type="button" role="columnheader" aria-colindex="4"><span
                        class="neo-button-glyph fa fa-arrow-circle-up" id="neo-vnode-6"></span><span
                        class="neo-button-text" id="neo-grid-header-button-4__text">Country</span></button>
            </div>
            <div class="neo-grid-view-wrapper neo-selection-rowmodel" id="neo-grid-view-1__wrapper" tabindex="-1"
                 style="width: 800px;">
                <div style="height: 224px; width: 800px;" class="neo-grid-view" id="neo-grid-view-1" role="rowgroup">
                    <div style="height:32px;transform:translate(0px, 0px);" class="neo-grid-row"
                         id="neo-grid-view-1__row-0" aria-rowindex="2" data-record-id="tobiu" role="row">
                        <div style="min-width:200px;left:0px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-0__firstname" aria-colindex="1" role="gridcell">Tobias
                        </div>
                        <div style="min-width:200px;left:200px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-0__lastname" aria-colindex="2" role="gridcell">Uhlig
                        </div>
                        <div style="min-width:200px;left:400px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-0__githubId" aria-colindex="3" role="gridcell"><i
                                class="fa-brands fa-github"></i> tobiu
                        </div>
                        <div style="min-width:200px;left:600px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-0__country" aria-colindex="4" role="gridcell">Germany
                        </div>
                    </div>
                    <div style="height:32px;transform:translate(0px, 32px);" class="neo-grid-row neo-even"
                         id="neo-grid-view-1__row-1" aria-rowindex="3" data-record-id="rwaters" role="row">
                        <div style="min-width:200px;left:0px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-1__firstname" aria-colindex="1" role="gridcell">Rich
                        </div>
                        <div style="min-width:200px;left:200px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-1__lastname" aria-colindex="2" role="gridcell">Waters
                        </div>
                        <div style="min-width:200px;left:400px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-1__githubId" aria-colindex="3" role="gridcell"><i
                                class="fa-brands fa-github"></i> rwaters
                        </div>
                        <div style="min-width:200px;left:600px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-1__country" aria-colindex="4" role="gridcell">USA
                        </div>
                    </div>
                    <div style="height:32px;transform:translate(0px, 64px);" class="neo-grid-row"
                         id="neo-grid-view-1__row-2" aria-rowindex="4" data-record-id="mrsunshine" role="row">
                        <div style="min-width:200px;left:0px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-2__firstname" aria-colindex="1" role="gridcell">Nils
                        </div>
                        <div style="min-width:200px;left:200px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-2__lastname" aria-colindex="2" role="gridcell">Dehl
                        </div>
                        <div style="min-width:200px;left:400px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-2__githubId" aria-colindex="3" role="gridcell"><i
                                class="fa-brands fa-github"></i> mrsunshine
                        </div>
                        <div style="min-width:200px;left:600px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-2__country" aria-colindex="4" role="gridcell">Germany
                        </div>
                    </div>
                    <div style="height:32px;transform:translate(0px, 96px);" class="neo-grid-row neo-even"
                         id="neo-grid-view-1__row-3" aria-rowindex="5" data-record-id="camtnbikerrwc" role="row">
                        <div style="min-width:200px;left:0px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-3__firstname" aria-colindex="1" role="gridcell">Gerard
                        </div>
                        <div style="min-width:200px;left:200px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-3__lastname" aria-colindex="2" role="gridcell">Horan
                        </div>
                        <div style="min-width:200px;left:400px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-3__githubId" aria-colindex="3" role="gridcell"><i
                                class="fa-brands fa-github"></i> camtnbikerrwc
                        </div>
                        <div style="min-width:200px;left:600px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-3__country" aria-colindex="4" role="gridcell">USA
                        </div>
                    </div>
                    <div style="height:32px;transform:translate(0px, 128px);" class="neo-grid-row"
                         id="neo-grid-view-1__row-4" aria-rowindex="6" data-record-id="jsakalos" role="row">
                        <div style="min-width:200px;left:0px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-4__firstname" aria-colindex="1" role="gridcell">Jozef
                        </div>
                        <div style="min-width:200px;left:200px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-4__lastname" aria-colindex="2" role="gridcell">Sakalos
                        </div>
                        <div style="min-width:200px;left:400px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-4__githubId" aria-colindex="3" role="gridcell"><i
                                class="fa-brands fa-github"></i> jsakalos
                        </div>
                        <div style="min-width:200px;left:600px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-4__country" aria-colindex="4" role="gridcell">Slovakia
                        </div>
                    </div>
                    <div style="height:32px;transform:translate(0px, 160px);" class="neo-grid-row neo-even"
                         id="neo-grid-view-1__row-5" aria-rowindex="7" data-record-id="bhaustein" role="row">
                        <div style="min-width:200px;left:0px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-5__firstname" aria-colindex="1" role="gridcell">Bastian
                        </div>
                        <div style="min-width:200px;left:200px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-5__lastname" aria-colindex="2" role="gridcell">Haustein
                        </div>
                        <div style="min-width:200px;left:400px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-5__githubId" aria-colindex="3" role="gridcell"><i
                                class="fa-brands fa-github"></i> bhaustein
                        </div>
                        <div style="min-width:200px;left:600px;width:200px;" class="neo-grid-cell neo-undefined"
                             id="neo-grid-view-1__row-5__country" aria-colindex="4" role="gridcell">Germany
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="neo-grid-vertical-scrollbar" id="neo-grid-vertical-scrollbar-1">
            <div style="height:224px;" class="neo-grid-scrollbar-content" id="neo-vnode-7"></div>
        </div>
    </div>
</div>
```

Observe the difference in traffic! The JSON blueprint approach drastically reduces the amount of data transferred,
leading to faster updates and a better user experience.

> Whenever an “expert” claims that streaming XML is so much better and has less traffic, at least double-check if the
> person gets paid by the cloud industry.

In case you want to explore the full demos code:
[https://github.com/neomjs/neo/tree/dev/examples/serverside](https://github.com/neomjs/neo/tree/dev/examples/serverside)

## 8. The Performance Backbone: Neo.mjs’s Advanced Service Worker

While `dist/esm` ensures lean delivery, the Neo.mjs service worker is the pivotal component that guarantees
near-instantaneous load times after the initial visit. It's far more than just a simple asset cache;
it's intricately woven into the framework's architecture:

- **Version-Based Cache Clearing:** The service worker intelligently clears outdated caches based on your application’s
  version, ensuring users always receive the latest framework and application logic transparently, while still benefiting
  from powerful caching.
- **Targeted Caching Paths:** It precisely caches your `dist/esm` modules, including the critical shared workers (App,
  Data, VDom, Canvas, Task). This extends to third-party assets (like Monaco Editor files if configured) and even external
  resources (e.g., AI models or data fetched from `raw.githubusercontent.com/`).
- **Intelligent, App-Driven Cache Management (MessageChannel & RemoteMethodAccess):** This is a true differentiator.
  The Neo.mjs App Worker can intelligently instruct the Service Worker to perform dynamic cache operations. This tightly
  coupled communication allows for powerful features like predictive caching (proactively fetching and storing assets
  anticipated for future user actions or AI-driven UI changes, e.g., pre-loading AI model dependencies or new window
  component sets in the background) or granularly clearing specific cached assets
- **Granular Asset Management (removeAssets):** You have fine-grained control to remove outdated or unnecessary cached
  modules, keeping the cache lean and relevant.
- **Shared Worker Scope Caching:** Crucially, the service worker caches the foundational shared worker scripts,
  enabling instant cold starts of these essential background processes.

This ensures that the ES modules for your shared components, worker scripts, and UI generators are served with near-zero
latency after the initial load. New windows spawn instantly, and dynamically required code is available immediately,
creating a truly fluid and responsive user experience.

## 9. Synergy: The Neo.mjs Advantage for Gen AI Interfaces

The power of Neo.mjs emerges from the seamless synergy of these architectural layers, creating a highly efficient workflow
for Gen AI applications:

1.  **AI Generates JSON Blueprints:** The Generative AI outputs compact JSON configurations defining UI structure,
    component properties, and initial data.
2.  **App Worker Orchestrates with Blueprints:** The central App Worker ingests these JSON blueprints, which are small
    and efficient to transmit.
3.  **Dynamic Code Acquisition:** Leveraging the `dist/esm` delivery, the App Worker dynamically imports any necessary
    (minified) ES modules for the components or logic referenced in the blueprint. Thanks to the Service Worker, these
    are served instantly from cache over HTTP/3.
4.  **Shared Instance Management:** The App Worker creates or updates the persistent JavaScript component instances in
    its shared memory space.
5.  **Multi-Window Projection:** These intelligent JavaScript instances then project their UI into the DOMs of designated
    browser windows. Updates to an instance in the App Worker automatically reflect everywhere it’s displayed.
6.  **Monaco Editor as a First-Class Citizen:** This architecture allows powerful third-party components like Monaco Editor
    to be seamlessly integrated.

This performance trifecta — HTTP/3 for efficient network transfers, minimal JSON payloads for UI definitions, aggressive
Service Worker caching of granular ES modules, and Neo.mjs’s efficient multi-threading model — creates an unparalleled
level of responsiveness and power for complex web applications.

## 10. Walkthrough: A Day in the Life of a Neo.mjs Gen AI Dashboard

Let’s envision a typical workflow in a Neo.mjs-powered Generative AI dashboard:

1.  A user opens the application, and the core Neo.mjs framework and App Worker scripts are instantly loaded from the
    Service Worker cache.
2.  The user types a complex prompt into an input field in **Window 1 (Prompt Interface)**.
3.  The AI processes the prompt in the background, and as it works, **Window 2 (Reasoning Log)**, a separate browser window,
    dynamically displays the AI’s step-by-step reasoning or intermediate outputs in real-time, streamed from the App Worker.
4.  The AI generates Python code. This code is instantly displayed in **Window 3 (Monaco Editor)**, another browser window,
    utilizing Monaco’s rich editing capabilities.
5.  Concurrently, the AI also generates a compact JSON configuration (a blueprint) for a chart to visualize the Python
    code’s (simulated) output.
6.  The App Worker receives this JSON blueprint. If the `ChartView.mjs` component hasn't been used yet, the App Worker
    dynamically loads it via `import()` from the `dist/esm` folder. The Service Worker intercepts this request, providing
    the minified module almost instantly from cache.
7.  The App Worker creates a `ChartView` instance based on the blueprint, and its UI is rendered in
    **Window 4 (Output Visualization)**.
8.  The user refines the Python code in Window 3. Since the code’s data is linked to a shared JavaScript instance,
    **Window 4** automatically re-renders the chart based on the modified code’s (simulated) new output — no page refresh,
    no complex data syncing.
9.  Deciding they want the chart in a new, larger, dedicated window for closer inspection, the user clicks an “undock”
    button. The component tree for the chart is instantly unmounted from Window 4 and gracefully remounted into a new
    **Window 5**, with its state fully intact.

This seamless, fluid experience, jumping across multiple windows and dynamically loading complex UI, is precisely what
Neo.mjs enables.

## 11. Conclusion: Build What’s Next with Neo.mjs — Beyond Static HTML, Towards Structured UI Definition

Neo.mjs offers a forward-looking architecture that challenges conventional web development paradigms. It treats UI
definition like modern APIs — with clear, concise, JSON-based contracts fulfilled by a powerful client-side engine.
This, combined with its unique JavaScript-first, shared worker component model, truly portable UI, lean `dist/esm`
dynamism, and comprehensive Service Worker caching, makes it uniquely ideal for the inherently parallel and dynamic
nature of generative AI applications.

You might be thinking, “This sounds too good to be true, why haven’t I heard of it?” You’re not alone.
Neo.mjs is currently in that critical phase between “invention” and “acceptance” — a period of denial and resistance to
changing established workflows. But the exceptional performance and architectural elegance are undeniable, and I believe
it’s time for the community to take notice.

[GitHub - neomjs/neo](https://github.com/neomjs/neo)

But open source projects like Neo.mjs thrive on community. If this vision resonates with you — the promise of zero-build
development, lightning-fast multi-window applications, and a native approach to AI-driven UIs — then we need your help.
Explore the Github repository and dive into its examples. Create a demo, write about your experience, contribute to the
discussions. You are very welcome to join the Discord or Slack Channels.

Let’s move beyond the build-tool blues and build the future of web UIs, together.
