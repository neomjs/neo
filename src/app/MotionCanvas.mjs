import SharedCanvas from './SharedCanvas.mjs';

/**
 * @summary A shared canvas whose renderer follows the motion duration on its own canvas element.
 * @class Neo.app.MotionCanvas
 * @extends Neo.app.SharedCanvas
 */
class MotionCanvas extends SharedCanvas {
    static config = {
        /** @member {String} className='Neo.app.MotionCanvas' */
        className: 'Neo.app.MotionCanvas',
        /**
         * Stays still until the current host reads a positive duration.
         * @member {Boolean} still_=true
         * @reactive
         */
        still_: true
    }

    /** @member {Number} motionRead=0 The latest motion-token read for this host. */
    motionRead = 0

    /** @summary Checks the duration for each new renderer graph. */
    afterSetIsCanvasReady(value, oldValue) {
        super.afterSetIsCanvasReady(value, oldValue);
        value && this.readMotion()
    }

    /** @summary Reads on mount and restores stillness when the host leaves the DOM. */
    afterSetMounted(value, oldValue) {
        if (value) {
            this.readMotion()
        } else {
            this.motionRead++;
            this.still = true
        }

        return super.afterSetMounted(value, oldValue)
    }

    /** @summary Reads from the destination window when a mounted canvas moves. */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (oldValue) {
            this.still = true;
            this.readMotion()
        }
    }

    /** @summary Observes OS motion changes delivered to the App Worker. */
    construct(config) {
        super.construct(config);
        Neo.currentWorker.on('neoConfigChange', this.onMotionPreferenceChange, this)
    }

    /** @summary Releases this host's worker listener. */
    destroy(...args) {
        Neo.currentWorker.un('neoConfigChange', this.onMotionPreferenceChange, this);
        super.destroy(...args)
    }

    /**
     * @summary A preference change invalidates the computed token in each mounted host's own window.
     * @param {Object} config Changed worker configuration.
     * @protected
     */
    onMotionPreferenceChange(config) {
        if ('prefersReducedMotion' in config) return this.readMotion()
    }

    /** @summary Refreshes the host's CSS duration when the window returns. */
    onWindowVisibility(data) {
        super.onWindowVisibility(data);
        !data.hidden && this.readMotion()
    }

    /**
     * @summary Applies the latest mounted read of `--motion-base`. Missing or unreadable durations keep the
     * renderer still. Reads from a departed window or graph cannot update its successor.
     * @returns {Promise<void>}
     */
    async readMotion() {
        const me = this;
        if (!me.mounted || me.isDestroyed) return;

        const read = ++me.motionRead, graph = me.rendererGraph, {windowId} = me;
        let duration;

        try {
            const styles = await Neo.main.DomAccess.getComputedStyle({id: me.id, style: '--motion-base', windowId});
            duration = parseFloat(styles?.['--motion-base'])
        } catch {}

        if (read === me.motionRead && me.mounted && !me.isDestroyed && me.windowId === windowId && me.rendererGraph === graph) {
            me.still = !(duration > 0)
        }
    }
}

export default Neo.setupClass(MotionCanvas);
