import Component from '../../../src/component/Base.mjs';

const states = [
    {state: 'working',   title: 'Working'},
    {state: 'reviewing', title: 'Reviewing'},
    {state: 'idle',      title: 'Idle'},
    {state: 'blocked',   title: 'Blocked'}
];

/**
 * @summary The desk's counts: agents per state, tokens used and pull requests merged, recounted on every change.
 *
 * The pane binds the desk's agents store and recounts when a record changes, so a state switched in the Inspector
 * moves a count here, in whatever zone either pane sits.
 * @class Neo.examples.dashboard.desk.MetricsPane
 * @extends Neo.component.Base
 */
class MetricsPane extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.MetricsPane'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.MetricsPane',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.agents'
        },
        /**
         * @member {String[]} baseCls=['neo-example-desk-metrics']
         */
        baseCls: ['neo-example-desk-metrics'],
        /**
         * The desk's agents, owned by its provider
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null
    }

    /**
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = {load: me.renderCounts, recordChange: me.renderCounts, scope: me};

        oldValue?.un(listeners);
        value?.on(listeners);

        me.renderCounts()
    }

    /**
     * Stops listening to the store, which the provider destroys after this pane
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.store?.un({load: me.renderCounts, recordChange: me.renderCounts, scope: me});

        super.destroy(...args)
    }

    /**
     * @param {String} value
     * @param {String} label
     * @param {String} [modifier]
     * @returns {Object} The vdom of one tile
     */
    createTile(value, label, modifier) {
        return {
            cls: ['neo-example-desk-metric', modifier && `neo-example-desk-metric-${modifier}`].filter(Boolean),
            cn : [
                {cls: ['neo-example-desk-metric-value'], text: value},
                {cls: ['neo-example-desk-metric-label'], text: label}
            ]
        }
    }

    /**
     * Rebuilds the tiles from the store's records
     */
    renderCounts() {
        let me      = this,
            records = me.store?.items || [],
            sum     = field => records.reduce((total, record) => total + record[field], 0);

        me.vdom.cn = [
            ...states.map(({state, title}) =>
                me.createTile(String(records.filter(record => record.state === state).length), title, state)),
            me.createTile(`${Math.round(sum('tokens') / 1000)}k`, 'Tokens today'),
            me.createTile(String(sum('merged')), 'Merged today')
        ];

        me.update()
    }
}

export default Neo.setupClass(MetricsPane);
