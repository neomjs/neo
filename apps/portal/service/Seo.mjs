import Base from '../../../src/core/Base.mjs';

/**
 * @summary Manages lightweight, zero-fetch client-side document titles for the Portal SPA across browser windows.
 *
 * Crawler and agent HTTP snapshots (`Googlebot`, LLM bots) never enter `#/...` hash routes and receive
 * route-specific `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph, and
 * `data-schema-name="neo-route"` JSON-LD directly from `neomjs/middleware-v2` (`SsrService#buildHeadInjection`
 * reading `apps/portal/resources/data/seo.json` on the server). In the client-side multi-window Portal SPA,
 * this singleton updates `document.title` synchronously from a compact section/family map on route changes
 * and accepts leaf record title refinements (`setRouteTitle`) from content controllers while leaving static
 * `<head>` metadata in `apps/portal/index.html` untouched.
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
         * Static client-side window titles for top-level Portal sections, `/news/*` tabs, and `/examples/*` families,
         * aligned with `apps/portal/resources/data/seo.json` top-level and family titles.
         * @member {Object<String,String>} routeTitles
         */
        routeTitles: {
            '/'                     : 'Neo.mjs - An Agent Institution',
            '/about-us'             : 'About Us - Neo.mjs',
            '/docs'                 : 'API Documentation — Multi-Threaded JavaScript Application Engine | Neo.mjs',
            '/examples'             : 'Live JavaScript Examples — Web Worker Grids & Multi-Window UI | Neo.mjs',
            '/examples/calendar'    : 'Neo.mjs Calendar Examples',
            '/examples/components'  : 'Neo.mjs Components Examples',
            '/examples/forms'       : 'Neo.mjs Forms Examples',
            '/examples/grid'        : 'Neo.mjs Grid & Table Examples',
            '/examples/multi-window': 'Neo.mjs Multi-Window Examples',
            '/examples/state'       : 'Neo.mjs State & Data Examples',
            '/home'                 : 'Neo.mjs - An Agent Institution',
            '/learn'                : 'Developer Guides — Web Worker UI Engine, SharedWorker & AI Agent OS | Neo.mjs',
            '/news'                 : 'Neo.mjs News',
            '/news/blog'            : 'Engineering Blog — Web Worker UI Architecture & AI Agent OS | Neo.mjs',
            '/news/discussions'     : 'Neo.mjs Discussions',
            '/news/medium'          : 'Neo.mjs on Medium',
            '/news/pulls'           : 'Neo.mjs Pull Requests',
            '/news/releases'        : 'Neo.mjs Releases',
            '/news/tickets'         : 'Neo.mjs Tickets',
            '/news/videos'          : 'Neo.mjs Videos',
            '/services'             : 'Connect with Neo.mjs'
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Tracks the latest normalized route per `windowId` so delayed store-driven leaf title updates
     * never overwrite a newer navigation in the same browser window.
     * @member {Map<String|Number|undefined,String>} #activeRoutes=new Map()
     * @private
     */
    #activeRoutes = new Map()

    /**
     * @summary Resolves the synchronous client-side document title for a route hash, falling back
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
     * @summary Updates the target window's `document.title` synchronously from `routeTitles` when the route changes.
     * @param {Object} config
     * @param {String} [config.hash]       Fallback route hash string.
     * @param {String} [config.hashString] Active route hash string from `ViewportController#onHashChange`.
     * @param {String} [config.windowId]   Target browser `windowId`.
     * @returns {Promise<Boolean>}
     */
    async onRouteChanged(config) {
        let rawRoute = config?.hashString || (typeof config?.hash === 'string' ? config.hash : null),
            route    = this.normalizeRoute(rawRoute),
            windowId = config?.windowId,
            title;

        if (!route) {
            return false
        }

        this.#activeRoutes.set(windowId, route);
        title = this.getTitle(route);

        return title ? this.setTitle({title, windowId}) : false
    }

    /**
     * @summary Refines a window's `document.title` from a loaded leaf record only if `route` is still
     * the active route for `windowId`.
     * @param {Object} config
     * @param {String} config.route      Route that initiated the leaf selection.
     * @param {String} config.title      Leaf-specific document title.
     * @param {String} [config.windowId] Target browser `windowId`.
     * @returns {Promise<Boolean>}
     */
    async setRouteTitle({route, title, windowId}) {
        let normalizedRoute = this.normalizeRoute(route),
            activeRoute     = this.#activeRoutes.get(windowId);

        if (!normalizedRoute || !title) {
            return false
        }

        if (activeRoute && activeRoute !== normalizedRoute) {
            return false
        }

        this.#activeRoutes.set(windowId, normalizedRoute);

        return this.setTitle({title, windowId})
    }

    /**
     * @summary Writes `document.title` in the target browser window via `Neo.main.addon.DocumentHead#setTitle`.
     * @param {Object} config
     * @param {String} config.title      The new document title.
     * @param {String} [config.windowId] Target browser `windowId`.
     * @returns {Promise<Boolean>}
     */
    async setTitle({title, windowId}) {
        if (!title) {
            return false
        }

        let DocumentHead = await Neo.currentWorker.getAddon('DocumentHead', windowId);

        await DocumentHead.setTitle({value: title, windowId});

        return true
    }
}

export default Neo.setupClass(Seo);
