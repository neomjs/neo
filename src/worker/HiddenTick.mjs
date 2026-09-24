import Base from '../core/Base.mjs';

/**
 * @summary Ticks each hidden window from its worker: a hidden document throttles its own timers, not a worker's or its messages.
 *
 * @class Neo.worker.HiddenTick
 * @extends Neo.core.Base
 */
class HiddenTick extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.HiddenTick'
         * @protected
         */
        className: 'Neo.worker.HiddenTick',
        /**
         * Tick period in ms
         * @member {Number} interval=1000
         */
        interval: 1000,
        /**
         * The worker whose ports carry the ticks
         * @member {Neo.worker.Base|null} worker=null
         */
        worker: null
    }

    /**
     * @member {Map<String, Number>} timers=new Map() Running interval ids, keyed by windowId
     */
    timers = new Map()

    /**
     * Stops every tick before the instance releases its members
     */
    destroy() {
        this.timers.forEach(timer => clearInterval(timer));
        super.destroy()
    }

    /**
     * @param {String} windowId
     */
    stop(windowId) {
        clearInterval(this.timers.get(windowId));
        this.timers.delete(windowId)
    }

    /**
     * Applies a window's visibility report: a hidden window starts ticking, a visible one stops.
     * @param {Object}  data
     * @param {Boolean} data.hidden
     * @param {String}  data.windowId
     */
    sync({hidden, windowId}) {
        let me = this;

        if (!hidden) {
            me.stop(windowId)
        } else if (windowId && !me.timers.has(windowId)) {
            me.timers.set(windowId, setInterval(() => me.tick(windowId), me.interval))
        }
    }

    /**
     * Sends one tick; `windowId` doubles as routing key, so a missed port lookup stops the tick instead of reaching another window.
     * @param {String} windowId
     * @protected
     */
    tick(windowId) {
        this.worker.sendMessage(windowId, {action: 'hiddenTick', windowId}) || this.stop(windowId)
    }
}

export default Neo.setupClass(HiddenTick);
