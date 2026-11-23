import Base from '../../../src/core/Base.mjs';

/**
 * @summary Manages lightweight, zero-fetch client-side document titles for the Portal SPA across browser windows.
 *
 * Crawler and agent HTTP snapshots (`Googlebot`, LLM bots) never enter `#/...` hash routes and receive
 * route-specific `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph, and
 * `data-schema-name="neo-route"` JSON-LD directly from `neomjs/middleware-v2` (`SsrService#buildHeadInjection`
 * reading `apps/portal/resources/data/seo.json` on the server). In the client-side multi-window Portal SPA,
 * this singleton resolves route titles in memory from a compact section/family map with zero network fetches,
 * coordinates navigation ordering with leaf content controllers (`registerNavigation` / `setRouteTitle`), and
 * publishes the winning per-window title across the asynchronous `DocumentHead` main-thread addon boundary while
 * leaving static `<head>` metadata in `apps/portal/index.html` untouched.
 *
 * @class Portal.service.Seo
 * @extends Neo.core.Base
 * @singleton
 * @see Portal.view.ViewportController
 */
class Seo extends Base {
    static config = {
        /**
         * @member {String} className='Portal.service.Seo'
         * @protected
         */
        className: 'Portal.service.Seo',
        /**
         * Static client-side window titles for top-level Portal sections, `/news/*` tabs, and `/examples/*` groups,
         * aligned with `apps/portal/resources/data/seo.json` top-level titles and with every group title in
         * `EXAMPLE_FAMILY_SEO` (`buildScripts/docs/seo/seoJson.mjs`).
         * @member {Object<String,String>} routeTitles
         */
        routeTitles: {
            '/'                     : 'Neo.mjs - An Agent Institution',
            '/about-us'             : 'About Us - Neo.mjs',
            '/docs'                 : 'API Documentation — Multi-Threaded JavaScript Application Engine | Neo.mjs',
            '/examples'             : 'Live JavaScript Examples — Web Worker Grids & Multi-Window UI | Neo.mjs',
            '/examples/apps'        : 'JavaScript Web App Examples — Full Apps on Worker Threads | Neo.mjs',
            '/examples/board'       : 'JavaScript Task & Kanban Board — Swimlanes & Cards | Neo.mjs',
            '/examples/buttons'     : 'JavaScript Buttons, Menus & Toolbars — Live Examples | Neo.mjs',
            '/examples/calendar'    : 'MIT JavaScript Calendar — Day, Week, Month & Year Views | Neo.mjs',
            '/examples/charts'      : 'JavaScript Charts, Canvas & Maps — OffscreenCanvas Demos | Neo.mjs',
            '/examples/components'  : 'JavaScript UI Component Examples — Off the Main Thread | Neo.mjs',
            '/examples/dashboard'   : 'JavaScript Dashboard & Docking — Panes That Pop Out | Neo.mjs',
            '/examples/dialogs'     : 'JavaScript Dialogs & Overlays — Live Examples | Neo.mjs',
            '/examples/drag-drop'   : 'JavaScript Drag & Drop Examples — Boards, Lists & Panes | Neo.mjs',
            '/examples/forms'       : 'JavaScript Form Examples — Fields, Pickers & Validation | Neo.mjs',
            '/examples/functional'  : 'JavaScript Functional Component Examples | Neo.mjs',
            '/examples/gantt'       : 'MIT JavaScript Gantt Chart — Linked, Editable Tasks | Neo.mjs',
            '/examples/grid'        : 'JavaScript Data Grid Examples — 100k Rows in a Web Worker | Neo.mjs',
            '/examples/layouts'     : 'JavaScript Containers & Layouts — Flexbox, Card & Form | Neo.mjs',
            '/examples/lists'       : 'JavaScript Lists & Galleries — 3D Helix & Gallery Views | Neo.mjs',
            '/examples/multi-window': 'Multi-Window JavaScript App Examples — SharedWorker State | Neo.mjs',
            '/examples/platform'    : 'JavaScript Web Worker Examples — Workers & Platform | Neo.mjs',
            '/examples/scheduler'   : 'MIT JavaScript Resource Scheduler — Editable Timeline | Neo.mjs',
            '/examples/state'       : 'JavaScript State Management Examples — Reactive Stores | Neo.mjs',
            '/examples/tabs'        : 'JavaScript Tabs — Reorderable Tab Bars & Overflow | Neo.mjs',
            '/examples/tree'        : 'JavaScript Trees — Tree Grids, Lists & Accordions | Neo.mjs',
            '/home'                 : 'Neo.mjs - An Agent Institution',
            '/learn'                : 'Developer Guides — Web Worker UI Engine, SharedWorker & AI Agent OS | Neo.mjs',
            '/news'                 : 'News, Blog & Release Notes — Multi-Threaded JavaScript Engine | Neo.mjs',
            '/news/blog'            : 'Engineering Blog — Web Worker UI Architecture & AI Agent OS | Neo.mjs',
            '/news/discussions'     : 'Architectural Discussions & RFCs — Neo.mjs Engine & Agent OS',
            '/news/medium'          : 'Medium & ITNEXT Article Archive — Neo.mjs Engineering',
            '/news/pulls'           : 'GitHub Pull Request Archive — Neo.mjs',
            '/news/releases'        : 'Release Notes & Changelog — Multi-Threaded JavaScript Engine | Neo.mjs',
            '/news/tickets'         : 'GitHub Issue Archive — Neo.mjs',
            '/news/videos'          : 'Videos & Live Demos — Multi-Window Web Apps & Agent OS | Neo.mjs',
            '/services'             : 'Connect with Neo.mjs'
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Tracks per-window navigation state (`{leafResolved, navId, route, writeSeq}`) so warm leaf controllers
     * win regardless of `HashHistory` listener order, delayed store callbacks from prior navigations are
     * ignored, and slower earlier `getAddon('DocumentHead', windowId)` lookups cannot overwrite newer writes.
     * @member {Map<String|Number|undefined,Object>} #windowStates=new Map()
     * @private
     */
    #windowStates = new Map()

    /**
     * @summary Returns (and lazily initializes) the mutable navigation/write state record for `windowId`.
     * @param {String|Number|undefined} windowId
     * @returns {{leafResolved: Boolean, navId: Number, route: String|null, writeSeq: Number}}
     * @private
     */
    #getWindowState(windowId) {
        let state = this.#windowStates.get(windowId);

        if (!state) {
            state = {
                leafResolved: false,
                navId       : 0,
                route       : null,
                writeSeq    : 0
            };
            this.#windowStates.set(windowId, state)
        }

        return state
    }

    /**
     * @summary Resolves the in-memory client-side document title for a route hash, falling back
     * to parent path segments when a deep leaf has not yet selected its store record.
     * @param {String} route The route hash string (e.g., `'/services'`, `'/learn/benefits/Introduction'`).
     * @returns {String|null}
     */
    getTitle(route) {
        let normalizedRoute = this.normalizeRoute(route),
            {routeTitles}   = this,
            lookupRoute, parts;

        if (!normalizedRoute || !routeTitles) {
            return null
        }

        if (routeTitles[normalizedRoute]) {
            return routeTitles[normalizedRoute]
        }

        lookupRoute = normalizedRoute;
        parts       = lookupRoute.split('/');

        while (parts.length > 1) {
            parts.pop();
            lookupRoute = parts.join('/') || '/';

            if (routeTitles[lookupRoute]) {
                return routeTitles[lookupRoute]
            }
        }

        return null
    }

    /**
     * @summary Normalizes a route hash string into a leading-slash pathname with any in-page `#fragment`
     * or trailing slash stripped (`'/'` preserved).
     * @param {String} route
     * @returns {String|null}
     */
    normalizeRoute(route) {
        if (!route || typeof route !== 'string') {
            return null
        }

        let normalized = route.split('#')[0].trim();

        if (!normalized) {
            return null
        }

        if (!normalized.startsWith('/')) {
            normalized = `/${normalized}`
        }

        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1)
        }

        return normalized
    }

    /**
     * @summary Resolves the fallback window title in memory from `routeTitles` and publishes it via
     * `DocumentHead#setTitle` unless a warmed leaf controller already refined the current navigation.
     * @param {Object} config
     * @param {String} [config.hash]             Fallback route hash string.
     * @param {String} [config.hashString]       Active route hash string from `ViewportController#onHashChange`.
     * @param {String|Number} [config.windowId]  Target browser `windowId`.
     * @returns {Promise<Boolean>}
     */
    async onRouteChanged(config) {
        let rawRoute     = config?.hashString || (typeof config?.hash === 'string' ? config.hash : null),
            route        = this.normalizeRoute(rawRoute),
            windowId     = config?.windowId,
            navigationId = this.registerNavigation({route, windowId}),
            state, title;

        if (navigationId === null) {
            return false
        }

        state = this.#getWindowState(windowId);

        if (state.leafResolved) {
            return true
        }

        title = this.getTitle(route);

        return title ? this.setTitle({title, windowId}) : false
    }

    /**
     * @summary Registers an active route navigation for `windowId` before controller async steps run,
     * advancing per-window `navId` and invalidating in-flight writes when the normalized route changes.
     * @param {Object} config
     * @param {String} [config.hash]             Fallback route hash string.
     * @param {String} [config.hashString]       Active route hash string.
     * @param {String} [config.route]            Explicit route hash string.
     * @param {String|Number} [config.windowId]  Target browser `windowId`.
     * @returns {Number|null} Active monotonic `navigationId` for `windowId`, or `null` when invalid.
     */
    registerNavigation(config) {
        let rawRoute = config?.route || config?.hashString || (typeof config?.hash === 'string' ? config.hash : null),
            route    = this.normalizeRoute(rawRoute),
            windowId = config?.windowId,
            state;

        if (!route) {
            return null
        }

        state = this.#getWindowState(windowId);

        if (state.route !== route) {
            state.navId       += 1;
            state.route        = route;
            state.leafResolved = false;
            state.writeSeq    += 1
        }

        return state.navId
    }

    /**
     * @summary Refines a window's `document.title` from a loaded leaf record only if `route` (and optional
     * `navigationId`) still matches the active navigation for `windowId`.
     * @param {Object} config
     * @param {Number} [config.navigationId]     Monotonic token returned by `registerNavigation`.
     * @param {String} config.route              Route that initiated the leaf selection.
     * @param {String} config.title              Leaf-specific document title.
     * @param {String|Number} [config.windowId]  Target browser `windowId`.
     * @returns {Promise<Boolean>}
     */
    async setRouteTitle({navigationId, route, title, windowId}) {
        let normalizedRoute = this.normalizeRoute(route),
            state           = this.#getWindowState(windowId);

        if (!normalizedRoute || !title) {
            return false
        }

        if (navigationId !== undefined && state.navId !== navigationId) {
            return false
        }

        if (state.route && state.route !== normalizedRoute) {
            return false
        }

        if (!state.route) {
            state.navId += 1;
            state.route  = normalizedRoute
        }

        state.leafResolved = true;

        return this.setTitle({title, windowId})
    }

    /**
     * @summary Publishes `document.title` in the target browser window via `Neo.main.addon.DocumentHead#setTitle`,
     * dropping superseded writes whose asynchronous `getAddon` lookup resolved after a newer write started.
     * @param {Object} config
     * @param {String} config.title              The new document title.
     * @param {String|Number} [config.windowId]  Target browser `windowId`.
     * @returns {Promise<Boolean>}
     */
    async setTitle({title, windowId}) {
        if (!title) {
            return false
        }

        let state        = this.#getWindowState(windowId),
            writeSeq     = ++state.writeSeq,
            DocumentHead = await Neo.currentWorker.getAddon('DocumentHead', windowId);

        if (this.#getWindowState(windowId).writeSeq !== writeSeq) {
            return false
        }

        await DocumentHead.setTitle({value: title, windowId});

        return this.#getWindowState(windowId).writeSeq === writeSeq
    }
}

export default Neo.setupClass(Seo);
