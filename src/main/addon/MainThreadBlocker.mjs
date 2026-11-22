import Base from './Base.mjs';

/**
 * @summary Blocks the main thread of a window on purpose, for a set time.
 *
 * A Neo app runs in the App Worker, so nothing it does can stall the main thread, and a demonstration or a test of
 * what stays alive while the main thread is busy has no way to make it busy. This addon is that way: one remote
 * method that runs a synchronous loop. While it runs, the window handles no event, applies no DOM update and paints
 * nothing the main thread owns. A canvas that a canvas worker draws goes on, which `examples/worker/canvas` shows.
 *
 * No engine default loads it: an app opts in through `mainThreadAddons` in its `neo-config.json`.
 *
 * @class Neo.main.addon.MainThreadBlocker
 * @extends Neo.main.addon.Base
 */
class MainThreadBlocker extends Base {
    /**
     * The longest block one call gets, in milliseconds. A longer `duration` is cut to it, so a wrong argument
     * cannot hang a window for good.
     * @member {Number} maxDuration=10000
     * @static
     */
    static maxDuration = 10000

    static config = {
        /**
         * @member {String} className='Neo.main.addon.MainThreadBlocker'
         * @protected
         */
        className: 'Neo.main.addon.MainThreadBlocker',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: ['block']}
         * @protected
         * @reactive
         */
        remote: {
            app: ['block']
        }
    }

    /**
     * @summary Runs a synchronous loop on this window's main thread until `duration` has passed.
     * @param {Object} [data={}]
     * @param {Number} [data.duration=1000] In milliseconds; a value above `maxDuration` is cut to it
     * @returns {{duration: Number}} The time the loop took, as the main thread measured it
     */
    block({duration=1000}={}) {
        const
            start = performance.now(),
            end   = start + Math.min(Math.max(0, duration), this.constructor.maxDuration);

        while (performance.now() < end) {}

        return {duration: performance.now() - start}
    }
}

export default Neo.setupClass(MainThreadBlocker);
