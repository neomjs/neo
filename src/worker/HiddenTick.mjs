/**
 * @summary Ticks each hidden window from its worker: a hidden document throttles its own timers, not a worker's or its messages.
 *
 * @class Neo.worker.HiddenTick
 */
class HiddenTick {
    /**
     * @member {Map<String, Number>} timers=new Map() Running interval ids, keyed by windowId
     */
    timers = new Map()

    /**
     * @param {Neo.worker.Base} worker          The worker whose ports carry the ticks
     * @param {Number}          [interval=1000] Tick period in ms
     */
    constructor(worker, interval=1000) {
        this.interval = interval;
        this.worker   = worker
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

export default HiddenTick;
