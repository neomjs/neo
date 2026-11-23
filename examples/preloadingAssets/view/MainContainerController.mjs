import Controller from '../../../src/controller/Component.mjs';

const assetRoot = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/examples/ai_images/',
      cacheName = 'neo-example-preloading-assets';

/** @summary The two profile assets that visitors can open independently. */
export const profiles = [{
    name: 'Bob',
    role: 'Product designer',
    url : assetRoot + '000150.jpg'
}, {
    name: 'Alice',
    role: 'Design researcher',
    url : assetRoot + '000074.jpg'
}];

/**
 * @summary Prefetches the next portrait through the Service Worker and counts where each read came from.
 * @class Neo.examples.preloadingAssets.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.preloadingAssets.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.preloadingAssets.view.MainContainerController'
    }

    #cacheOnly  = false;
    #cacheOpens = 0;
    #network    = 0;
    #opens      = 0;
    #portraits  = new Map();
    #transfers  = profiles.map(() => ({pending: null, fetching: false, generation: 0}));

    /** @summary Releases the portrait URLs created by this view. */
    destroy() {
        for (const url of this.#portraits.values()) {
            URL.revokeObjectURL(url)
        }

        super.destroy()
    }

    /** @summary Starts the visible portrait and connects the tab headers to preloading. */
    onMounted() {
        const tabs = this.getReference('profiles');

        if (!Neo.config.hasTouchEvents) {
            tabs.getTabButtons().forEach((button, index) => {
                button.addDomListeners({
                    mouseenter: () => this.onProfileIntent(index),
                    scope     : this
                })
            })
        }

        // Take the cache snapshot when selection changes, before the tab layout finishes asynchronously.
        this.observeConfig(tabs, 'activeIndex', index => this.showProfile(index));
        this.showProfile(tabs.activeIndex)
    }

    /**
     * @summary Warms the selected tab's asset while the visitor is still on the current tab.
     * @param {Number} index
     */
    async onProfileIntent(index) {
        const tabs      = this.getReference('profiles'),
              selection = tabs.activeIndex;

        if (selection === index || this.#cacheOnly) return;

        try {
            const cache = await caches.open(cacheName),
                  ready = await cache.match(profiles[index].url) || await this.downloadProfile(index, cache);

            if (!this.isDestroyed && tabs.activeIndex === selection && !this.#cacheOnly) {
                this.getReference('activity').text = ready
                    ? profiles[index].name + ' is ready in the cache.'
                    : 'The portrait could not be preloaded. You can still try opening the tab.'
            }
        } catch {
            if (!this.isDestroyed && tabs.activeIndex === selection && !this.#cacheOnly) {
                this.getReference('activity').text = 'The portrait could not be preloaded. You can still try opening the tab.'
            }
        }
    }

    /** @summary Gives touch and keyboard users the same preloading action as hovering over a tab. */
    onPreloadNextTab() {
        const {activeIndex} = this.getReference('profiles');
        this.onProfileIntent((activeIndex + 1) % profiles.length)
    }

    /** @summary Disables new network requests for this demo's portraits while the switch is on. */
    onToggleCacheOnly() {
        this.#cacheOnly = !this.#cacheOnly;
        this.getReference('cache-only').pressed = this.#cacheOnly;
        this.getReference('activity').text = this.#cacheOnly
            ? 'Cache-only mode is on. Open a preloaded tab.'
            : 'Network access is enabled for portraits.';

        const {activeIndex} = this.getReference('profiles');
        if (!this.#cacheOnly && this.getReference('portrait-' + activeIndex).hidden) {
            this.showProfile(activeIndex)
        }
    }

    /**
     * @summary Shares an in-flight transfer between hover and click and records completed network loads once.
     * @param {Number} index
     * @param {Cache} cache
     * @returns {Promise<Boolean>}
     */
    async downloadProfile(index, cache) {
        const transfer = this.#transfers[index];

        if (transfer.pending) return transfer.pending;
        if (this.#cacheOnly || this.isDestroyed) return false;

        transfer.pending = (async () => {
            // A miss reported to a competing caller can predate a transfer that has already finished.
            if (await cache.match(profiles[index].url)) return true;

            const registered = await this.waitFor(() => Boolean(Neo.ServiceWorker?.preloadAssets), {attempts: 250, delay: 20});

            if (!registered || this.#cacheOnly || this.isDestroyed) return false;

            transfer.fetching = true;
            transfer.generation++;

            const {success} = await Neo.ServiceWorker.preloadAssets({
                cacheName,
                files      : [profiles[index].url],
                forceReload: true
            });

            if (success && !this.isDestroyed) {
                this.getReference('network-count').text = 'Network loads ' + ++this.#network
            }

            return success
        })();

        try {
            return await transfer.pending
        } finally {
            transfer.pending  = null;
            transfer.fetching = false
        }
    }

    /**
     * @summary Shows the portrait from the cache or its new transfer, ignoring responses from earlier tab selections.
     * @param {Number} index
     */
    async showProfile(index) {
        const request         = ++this.#opens,
              profile         = profiles[index],
              readsCurrentTab = () => !this.isDestroyed && request === this.#opens,
              transfer        = this.#transfers[index];

        const {fetching, generation} = transfer;

        try {
            const cache     = await caches.open(cacheName);
            let   response  = await cache.match(profile.url);
            // An overlapping transfer can fill the cache during this asynchronous lookup.
            const fromCache = Boolean(response) && !fetching && generation === transfer.generation;

            if (!response && await this.downloadProfile(index, cache)) {
                response = await cache.match(profile.url)
            }

            if (!response) {
                if (readsCurrentTab()) {
                    this.getReference('activity').text = this.#cacheOnly
                        ? profile.name + ' is not in the cache. Turn off Cache-only mode and preload the tab first.'
                        : 'The portrait is unavailable. Try opening its tab again.'
                }

                return
            }

            const blob = await response.blob();

            if (readsCurrentTab()) {
                let url = this.#portraits.get(index);

                if (!url) {
                    url = URL.createObjectURL(blob);
                    this.#portraits.set(index, url)
                }

                this.getReference('portrait-' + index).set({src: url, hidden: false});

                if (fromCache) {
                    this.getReference('cache-count').text = 'Cache opens ' + ++this.#cacheOpens
                }

                this.getReference('activity').text = profile.name + (fromCache ? ' opened from the cache.' : ' loaded over the network.')
            }
        } catch {
            if (readsCurrentTab()) {
                this.getReference('activity').text = 'The portrait could not be loaded.'
            }
        }
    }
}

export default Neo.setupClass(MainContainerController);
