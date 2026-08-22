import Component from '../../../src/component/Base.mjs';

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
 * @class Neo.examples.dashboard.choreography.ClockPane
 * @extends Neo.component.Base
 */
class ClockPane extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.choreography.ClockPane'
         * @protected
         */
        className: 'Neo.examples.dashboard.choreography.ClockPane',
        /**
         * @member {String[]} cls=['agentos-dockdemo-pane','agentos-dockdemo-clock-pane']
         */
        cls: ['agentos-dockdemo-pane', 'agentos-dockdemo-clock-pane'],
        /**
         * Test-determinism seam: ANY string (the empty string included) freezes the clock
         * line to exactly that string — the tick stops; the pane stays fully visible.
         * Visual-baseline harnesses set it over the Neural Link as plain JSON — the
         * sanctioned alternative to masking the pane out of a golden or hot-patching the
         * tick. ONLY `null` thaws (resumes live wall time); the check is nullish, never
         * truthy, so the accepted value domain and the thaw trigger cannot drift apart.
         * @member {String|null} frozenTime_=null
         */
        frozenTime_: null,
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
        this.#syncClock()
    }

    /**
     * Freezing stops the tick and renders the constant; thawing (`null`) resumes the live
     * clock when mounted. Delegates to the clock-only sync helper — a config setter must
     * never re-enter the mount lifecycle (a phantom `mounted` transition re-fires core
     * DOM-event/VDOM machinery and the `mounted` event).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetFrozenTime(value, oldValue) {
        oldValue !== undefined && this.#syncClock()
    }

    /**
     * The single owner of tick-interval state: stops any running tick, renders the current
     * line, and (re)starts the tick only when mounted AND not frozen. Called from both the
     * mount lifecycle and the freeze seam — interval hygiene lives in exactly one place,
     * with zero lifecycle re-entry.
     * @private
     */
    #syncClock() {
        let me = this;

        me.#stopClock();

        if (me.mounted) {
            me.updateTime();

            if (me.frozenTime == null) {
                me.#clockIntervalId = setInterval(() => me.updateTime(), 1000)
            }
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
     * Renders the current wall time — or the frozen constant — into the clock line.
     * Nullish check on purpose: any STRING freezes (the empty string included); only
     * `null` means live time, matching the config contract exactly.
     */
    updateTime() {
        let me     = this,
            {vdom} = me;

        vdom.cn[1].html = me.frozenTime != null ? me.frozenTime : new Date().toLocaleTimeString('en-GB');
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
