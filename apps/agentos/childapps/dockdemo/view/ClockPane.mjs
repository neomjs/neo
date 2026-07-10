import Component from '../../../../../src/component/Base.mjs';

/**
 * @summary The editor pane's ticking-clock witness: a live seconds clock that keeps
 * counting through every dock transition.
 *
 * The clock is the demo's continuity witness — the storyboard keeps it visible through
 * every scene so a viewer can verify with their own eyes that the workspace never blanks
 * or stalls while an agent re-docks it. It renders absolute wall time (re-derived every
 * tick), so its continuity claim is honest under the current coarse workspace refresh:
 * the time reads true across re-projection, and when the instance-preserving workspace
 * reconcile lands on the dashboard side, the same component becomes the full
 * object-permanence witness with zero changes here.
 *
 * Interval hygiene: the tick starts on mount, stops on unmount, and destroy() is
 * idempotent about it — a demo pane must never leak timers across re-projections.
 * @class AgentOS.childapps.dockdemo.view.ClockPane
 * @extends Neo.component.Base
 */
class ClockPane extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.ClockPane'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.ClockPane',
        /**
         * @member {String[]} cls=['agentos-dockdemo-pane','agentos-dockdemo-clock-pane']
         */
        cls: ['agentos-dockdemo-pane', 'agentos-dockdemo-clock-pane'],
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [
                {cls: ['agentos-dockdemo-clock-label'], html: 'Editor'},
                {cls: ['agentos-dockdemo-clock-time'],  html: '—'},
                {cls: ['agentos-dockdemo-clock-note'],  html: 'live through every transition'}
            ]
        }
    }

    /**
     * The active tick interval id, cleared on unmount/destroy.
     * @member {Number|null} #clockIntervalId=null
     * @private
     */
    #clockIntervalId = null

    /**
     * Starts/stops the seconds tick with the mount lifecycle.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        me.#stopClock();

        if (value) {
            me.updateTime();
            me.#clockIntervalId = setInterval(() => me.updateTime(), 1000)
        }
    }

    /**
     * Clears the tick interval if one is running.
     * @private
     */
    #stopClock() {
        let me = this;

        if (me.#clockIntervalId !== null) {
            clearInterval(me.#clockIntervalId);
            me.#clockIntervalId = null
        }
    }

    /**
     * Renders the current wall time into the clock line.
     */
    updateTime() {
        let me     = this,
            {vdom} = me;

        vdom.cn[1].html = new Date().toLocaleTimeString('en-GB');
        me.update()
    }

    /**
     * Tears down the tick interval with the component.
     */
    destroy(...args) {
        this.#stopClock();
        super.destroy(...args)
    }
}

export default Neo.setupClass(ClockPane);
