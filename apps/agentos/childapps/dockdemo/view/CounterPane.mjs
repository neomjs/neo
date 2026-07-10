import Component from '../../../../../src/component/Base.mjs';

/**
 * @summary The Demo-B state-continuity witness: a frame counter that lives on the INSTANCE.
 *
 * The pane increments once per second from construction and renders its count. Unlike a
 * wall-clock (which survives remounts invisibly — it re-reads world state), this counter
 * resets to zero if the component is ever destroyed and recreated: an unbroken count across
 * a perspective morph, a pop-out to an OS window, and a reattach is PROOF the instance was
 * reparented, never remade — the object-permanence story the demo exists to show.
 * @class AgentOS.childapps.dockdemo.view.CounterPane
 * @extends Neo.component.Base
 */
class CounterPane extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.CounterPane'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.CounterPane',
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
            {cls: ['agentos-dockdemo-counter-note'],  text: 'this counter dies on remount — it has never remounted'}
        ];

        me.update()
    }
}

export default Neo.setupClass(CounterPane);
