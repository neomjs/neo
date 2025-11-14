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
     * Stores the most recent route hash received from `onRouteChanged()`.
     * This is used to process a pending route update if the service becomes ready after a route change occurred.
     * @member {String|null} #lastRouteHash=null
     * @private
     */
    #lastRouteHash = null
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
        if (value && this.#lastRouteHash) {
            this.#updateDocumentHeadIfNeeded(this.#lastRouteHash)
        }
    }

    /**
     * Retrieves the SEO metadata (title and description) for a given route hash.
     * @param {String} route The route hash string (e.g., '/home', '/blog').
     * @returns {Object|null} An object containing `title` and `description` for the route, or `null` if not found.
     */
    getMetadata(route) {
        return this.#metadata?.[route] || null
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
            const response = await fetch('../../apps/portal/resources/data/seo.json');
            if (!response.ok) {
                throw new Error(`HTTP error with status: ${response.status}`)
            }
            this.#metadata = await response.json();
        } catch (error) {
            console.error('Error fetching SEO metadata:', error)
        }
    }

    /**
     * Called by the `ViewportController` when the application's route changes.
     * This method stores the new route hash and attempts to update the document head.
     * If the service is not yet ready (i.e., `initAsync` is still running), the update
     * is deferred until `isReady` becomes true.
     * @param {String} hash The new route hash string.
     */
    onRouteChanged(hash) {
        this.#lastRouteHash = hash;
        this.#updateDocumentHeadIfNeeded(hash)
    }

    /**
     * This private method calls the `DocumentHead` main thread addon to update the document's
     * title and meta-description for SEO purposes. It is the actual mechanism for applying
     * the SEO changes to the browser's DOM.
     * @param {Object} config The configuration object containing `description` and `title`.
     * @param {String} config.description The new meta-description for the document.
     * @param {String} config.title The new title for the document.
     * @private
     */
    async #updateDocumentHead({description, title}) {
        let {windowId}   = this,
            DocumentHead = await Neo.currentWorker.getAddon('DocumentHead', windowId);

        await DocumentHead.update({description, title, windowId})
    }

    /**
     * A private helper method that conditionally updates the document head.
     * It checks if the service is `isReady` before attempting to retrieve metadata
     * and call `#updateDocumentHead`. If an update occurs, it clears `#lastRouteHash`.
     * This prevents multiple updates for the same route if `onRouteChanged` is called
     * before `initAsync` completes.
     * @param {String} hash The route hash for which to update the document head.
     * @private
     */
    #updateDocumentHeadIfNeeded(hash) {
        let me = this;

        if (me.isReady) {
            let metadata = me.getMetadata(hash);

            if (metadata) {
                me.#updateDocumentHead(metadata);
                me.#lastRouteHash = null
            }
        }
    }
}

export default Neo.setupClass(Seo);
