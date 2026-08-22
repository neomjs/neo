import Component from '../../../src/component/Base.mjs';

/**
 * @summary The Demo-B state-continuity witness: a frame counter that lives on the INSTANCE.
 *
 * The pane increments once per second from construction and renders its count. Unlike a
 * wall-clock (which re-reads world state), this instance-local value resets only if the
 * component is destroyed and recreated. Cross-window movement does run the target document's
 * normal mount lifecycle; the separate mount count makes that truth visible while the unbroken
 * seconds value proves the worker-owned instance and state were never remade.
 * @class Neo.examples.dashboard.crossWindow.CounterPane
 * @extends Neo.component.Base
 */
class CounterPane extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.crossWindow.CounterPane'
         * @protected
         */
        className: 'Neo.examples.dashboard.crossWindow.CounterPane',
        /**
         * @member {String[]} cls=['agentos-dockdemo-counter-pane']
         */
        cls: ['agentos-dockdemo-counter-pane']
    }

    /**
     * Seconds since THIS instance constructed — the continuity value. Instance field on
     * purpose: no config reactivity, no persistence; only an unbroken lifecycle keeps it.
     * @member {Number} frames=0
     */
    frames = 0
    /**
     * Number of browser-document mount events this live instance has completed. Moving into a
     * second OS window increments this count by design; preserving the JS instance does not mean
     * one DOM mount spans two documents.
     * @member {Number} mountCount=0
     */
    mountCount = 0
    /**
     * @member {Number|null} intervalId=null
     * @protected
     */
    intervalId = null

    /**
     * Starts the once-per-second heartbeat.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.intervalId = setInterval(() => {
            me.frames++;
            me.renderCount()
        }, 1000);

        me.renderCount()
    }

    /**
     * Counts truthful render-target embodiments while preserving the instance-local heartbeat.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && oldValue !== undefined) {
            this.mountCount++;
            this.renderCount()
        }
    }

    /**
     * Clears the heartbeat with the instance — a destroyed witness never ticks again,
     * which is exactly what makes a surviving count meaningful.
     * @param {...*} args
     */
    destroy(...args) {
        this.intervalId && clearInterval(this.intervalId);
        this.intervalId = null;

        super.destroy(...args)
    }

    /**
     * Projects the current count into the pane body.
     * @protected
     */
    renderCount() {
        let me = this;

        if (me.isDestroyed) return;

        me.vdom.cn = [
            {cls: ['agentos-dockdemo-counter-label'], text: 'WORKBENCH'},
            {cls: ['agentos-dockdemo-counter-value'], text: `${me.frames}s unbroken`},
            {cls: ['agentos-dockdemo-counter-note'],  text: `${me.mountCount} render-target mount${me.mountCount === 1 ? '' : 's'} · same worker instance`}
        ];

        me.update()
    }
}

export default Neo.setupClass(CounterPane);
