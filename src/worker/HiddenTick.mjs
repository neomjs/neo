/**
 * @summary Gives each hidden window a cadence that does not depend on its own document.
 *
 * A hidden document services no frames and the browser can throttle its timers to one wake per minute, while a
 * message from a worker still arrives when sent. So while a window is hidden, its worker sends it a `hiddenTick` once
 * per `interval`; main-thread consumers that must keep noticing layout, like the ResizeObserver addon's hidden poll,
 * subscribe to the message instead of arming a timer. The tick carries timing only, and stops when the window turns
 * visible or no port resolves for it any more.
 *
 * @class Neo.worker.HiddenTick
 */
class HiddenTick {
    /**
     * Tick period in ms while a window stays hidden.
     * @member {Number} interval=1000
     */
    interval = 1000
    /**
     * One running interval per hidden window, keyed by windowId.
     * @member {Map<String, Number>} timers
     * @protected
     */
    timers = new Map()
    /**
     * The worker whose ports carry the ticks.
     * @member {Neo.worker.Base|null} worker=null
     */
    worker = null

    /**
     * @param {Object}          config
     * @param {Number}          [config.interval=1000]
     * @param {Neo.worker.Base} config.worker
     */
    constructor({interval, worker}) {
        let me = this;

        me.worker = worker;

        if (interval !== undefined) {
            me.interval = interval
        }
    }

    /**
     * Starts ticking a window, unless it already ticks.
     * @param {String} windowId
     */
    start(windowId) {
        let me = this;

        if (!windowId || me.timers.has(windowId)) {
            return
        }

        me.timers.set(windowId, setInterval(() => {
            me.tick(windowId)
        }, me.interval))
    }

    /**
     * Stops ticking a window. A no-op for a window that does not tick.
     * @param {String} windowId
     */
    stop(windowId) {
        let me    = this,
            timer = me.timers.get(windowId);

        if (timer !== undefined) {
            clearInterval(timer);
            me.timers.delete(windowId)
        }
    }

    /**
     * Applies a window's visibility report: hidden windows tick, visible ones do not.
     * @param {Object}  data
     * @param {Boolean} data.hidden
     * @param {String}  data.windowId
     */
    sync({hidden, windowId}) {
        hidden ? this.start(windowId) : this.stop(windowId)
    }

    /**
     * Sends one tick, and stops the window once no port resolves for it — a departed window has none.
     *
     * `windowId` is passed as a routing key too: a message without one falls back to the worker's first port on a
     * lookup miss, which would tick some other window and never report the failure.
     * @param {String} windowId
     * @protected
     */
    tick(windowId) {
        this.worker.sendMessage(windowId, {action: 'hiddenTick', windowId}) || this.stop(windowId)
    }
}

export default HiddenTick;
