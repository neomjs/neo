import Base from '../../../src/core/Base.mjs';

/**
 * @summary Manages SEO metadata for the Portal application, fetching it from a JSON file
 * and intelligently updating the document head based on route changes.
 *
 * This singleton service is responsible for centralizing all SEO-related logic.
 * It fetches route-specific title and description metadata from `apps/portal/resources/data/seo.json`
 * during its asynchronous initialization. It then provides a mechanism for the `ViewportController`
 * to notify it of route changes. The service ensures that the document's `<title>` and `<meta name="description">`
 * tags are updated only when the service is fully ready and with the most recent route hash,
 * preventing race conditions on slow network connections.
 *
 * This class demonstrates the use of asynchronous initialization (`initAsync`), reactive config hooks (`afterSetIsReady`),
 * and private class fields to manage internal state and ensure robust behavior.
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
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Stores the most recent route received from `onRouteChanged()`.
     * This is used to process a pending route update if the service becomes ready after a route change occurred.
     * @member {Object|null} #lastRouteHash=null
     * @private
     */
    #lastRoute = null
    /**
     * Caches the SEO metadata fetched from `apps/portal/resources/data/seo.json`.
     * This object maps route hash strings to their corresponding title and description.
     * @member {Object|null} #metadata=null
     * @private
     */
    #metadata = null

    /**
     * Hook that fires after the `isReady` config changes. If the service becomes ready (`value` is true)
     * and there's a pending route hash (`#lastRouteHash` is not null), it triggers an update
     * of the document head with the metadata for that route.
     * @param {Boolean} value The new value of the `isReady` config.
     * @param {Boolean} oldValue The old value of the `isReady` config.
     * @protected
     */
    afterSetIsReady(value, oldValue) {
        super.afterSetIsReady(value, oldValue);

        if (value && this.#lastRoute) {
            this.#updateDocumentHeadIfNeeded(this.#lastRoute)
        }
    }

    /**
     * Retrieves the SEO metadata (title, description, schemaType, and normalized route) for a given route hash.
     * Supports nested routes by falling back to parent paths if an exact match is not found.
     * e.g., '/news/blog/my-post' -> '/news/blog' -> '/news'
     * @param {String} route The route hash string (e.g., '/home', '/learn/benefits/Introduction').
     * @returns {Object|null} An object containing `title`, `description`, optional `schemaType`, and `route`, or `null` if not found.
     */
    getMetadata(route) {
        let metadata = this.#metadata,
            lookupRoute, normalizedRoute, parts;

        if (!metadata || !route || typeof route !== 'string') {
            return null
        }

        normalizedRoute = route.startsWith('/') ? route : `/${route}`;

        if (normalizedRoute.length > 1 && normalizedRoute.endsWith('/')) {
            normalizedRoute = normalizedRoute.slice(0, -1)
        }

        if (metadata[normalizedRoute]) {
            return {
                ...metadata[normalizedRoute],
                route: normalizedRoute
            }
        }

        // Fallback logic for nested routes
        lookupRoute = normalizedRoute;
        parts       = lookupRoute.split('/');

        while (parts.length > 1) {
            parts.pop();
            lookupRoute = parts.join('/');

            if (metadata[lookupRoute]) {
                return {
                    ...metadata[lookupRoute],
                    route: normalizedRoute
                }
            }
        }

        return null
    }

    /**
     * Asynchronously initializes the SEO service by fetching the `seo.json` file.
     * This method simulates an API call to retrieve SEO data, making the service ready
     * to provide metadata. It ensures that the service is fully loaded before processing
     * any route-related document head updates.
     * @returns {Promise<void>} A promise that resolves when the metadata has been fetched and parsed.
     */
    async initAsync() {
        await super.initAsync();

        try {
            const response = await fetch(Neo.config.basePath + 'apps/portal/resources/data/seo.json');
            if (!response.ok) {
                throw new Error(`HTTP error with status: ${response.status}`)
            }
            this.#metadata = await response.json()
        } catch (error) {
            console.error('Error fetching SEO metadata:', error)
        }
    }

    /**
     * Called by the `ViewportController` when the application's route changes.
     * This method stores the new route hash and attempts to update the document head.
     * If the service is not yet ready (i.e., `initAsync` is still running), the update
     * is deferred until `isReady` becomes true.
     * @param {Object} config          The configuration object.
     * @param {String} config.hash     The new route hash string.
     * @param {String} config.windowId The windowId matching the route.
     */
    onRouteChanged(config) {
        this.#lastRoute = config;
        this.#updateDocumentHeadIfNeeded(config)
    }

    /**
     * Calls the `DocumentHead` main thread addon to update the document's title, meta-description,
     * canonical URL, Open Graph tags (`og:title`, `og:description`, `og:url`), and route-specific
     * `ld+json` (`data-schema-name="neo-route"`).
     * @param {Object} config
     * @param {String} config.description             The new meta-description for the document.
     * @param {String} [config.route]                 The normalized route path (e.g., '/learn/benefits/Introduction').
     * @param {String} [config.schemaType='WebPage']  The Schema.org `@type` for the route's `ld+json` block.
     * @param {String} config.title                   The new title for the document.
     * @param {String} config.windowId                The target windowId.
     * @private
     */
    async #updateDocumentHead({description, route, schemaType='WebPage', title, windowId}) {
        let DocumentHead = await Neo.currentWorker.getAddon('DocumentHead', windowId),
            canonicalUrl = route ? `https://neomjs.com${route}` : undefined,
            ldJson       = canonicalUrl ? {
                name : 'neo-route',
                value: {
                    '@context': 'https://schema.org',
                    '@type'   : schemaType,
                    headline  : title,
                    name      : title,
                    description,
                    url       : canonicalUrl,
                    isPartOf  : {
                        '@id': 'https://neomjs.com/#website'
                    }
                }
            } : undefined,
            tags = [
                ...(title        ? [{tag: 'meta', property: 'og:title',       content: title}]        : []),
                ...(description  ? [{tag: 'meta', property: 'og:description', content: description}]  : []),
                ...(canonicalUrl ? [{tag: 'meta', property: 'og:url',         content: canonicalUrl}] : [])
            ];

        await DocumentHead.update({
            canonicalUrl,
            description,
            ldJson,
            tags: tags.length ? tags : undefined,
            title,
            windowId
        })
    }

    /**
     * A private helper method that conditionally updates the document head.
     * It checks if the service is `isReady` before attempting to retrieve metadata
     * and call `#updateDocumentHead`. If an update occurs, it clears `#lastRouteHash`.
     * This prevents multiple updates for the same route if `onRouteChanged` is called
     * before `initAsync` completes.
     * @param {Object} config The route hash for which to update the document head.
     * @private
     */
    #updateDocumentHeadIfNeeded(config) {
        let me = this;

        if (me.isReady) {
            let route    = config?.hashString || (typeof config?.hash === 'string' ? config.hash : null),
                metadata = route ? me.getMetadata(route) : null;

            if (metadata) {
                me.#updateDocumentHead({...metadata, windowId: config.windowId});
                me.#lastRoute = null
            }
        }
    }
}

export default Neo.setupClass(Seo);
