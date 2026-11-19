import Button    from '../../../src/button/Base.mjs';
import Component from '../../../src/component/Base.mjs';
import Container from '../../../src/container/Base.mjs';

const states = [
    {state: 'working',   text: 'Working'},
    {state: 'reviewing', text: 'Reviewing'},
    {state: 'idle',      text: 'Idle'},
    {state: 'blocked',   text: 'Blocked'}
];

/**
 * @summary The selected agent, editable: its state switched here changes the record every other pane shows.
 *
 * The pane binds the desk's `agentId` and reads the agent from the desk's store. A state button sets the record's
 * `state`; the Swarm and Agents grids repaint that row and Metrics recounts, because all of them show the same record.
 * The pane listens to the store as well, so it repaints when the record changes elsewhere.
 * @class Neo.examples.dashboard.desk.InspectorPane
 * @extends Neo.container.Base
 */
class InspectorPane extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.InspectorPane'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.InspectorPane',
        /**
         * The selected agent's id, bound to the desk
         * @member {String|null} agentId_=null
         */
        agentId_: null,
        /**
         * @member {Object} bind
         */
        bind: {
            agentId: data => data.agentId,
            store  : 'stores.agents'
        },
        /**
         * @member {String[]} baseCls=['neo-container','neo-example-desk-inspector']
         */
        baseCls: ['neo-container', 'neo-example-desk-inspector'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Component,
            cls      : ['neo-example-desk-inspector-title'],
            flex     : 'none',
            reference: 'title'
        }, {
            module: Container,
            cls   : ['neo-example-desk-inspector-states'],
            flex  : 'none',
            // Two by two in CSS: four labels do not fit one row of a narrow side pane
            layout   : {ntype: 'base'},
            reference: 'states',
            items    : states.map(({state, text}) => ({
                module   : Button,
                cls      : ['neo-example-desk-state-button', `neo-example-desk-state-button-${state}`],
                handler  : 'up.onStateButtonClick',
                reference: state,
                text
            }))
        }, {
            module   : Component,
            cls      : ['neo-example-desk-inspector-details'],
            reference: 'details'
        }],
        /**
         * @member {Object} layout={ntype:'vbox', align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The desk's agents, owned by its provider
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAgentId(value, oldValue) {
        this.refresh()
    }

    /**
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        oldValue?.un({recordChange: me.onRecordChange, scope: me});
        value?.on({recordChange: me.onRecordChange, scope: me});

        me.refresh()
    }

    /**
     * Stops listening to the store, which the provider destroys after this pane
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.store?.un({recordChange: me.onRecordChange, scope: me});

        super.destroy(...args)
    }

    /**
     * @returns {Neo.data.Model|null} The selected agent
     */
    getAgent() {
        let {agentId, store} = this;

        return (agentId && store?.get(agentId)) || null
    }

    /**
     * Paints the agent once the items exist: the bindings may deliver it before the container built them
     */
    onConstructed() {
        super.onConstructed();
        this.refresh()
    }

    /**
     * @param {Object}         data
     * @param {Neo.data.Model} data.record
     */
    onRecordChange({record}) {
        record.id === this.agentId && this.refresh()
    }

    /**
     * Switches the selected agent to the clicked button's state
     * @param {Object} data
     */
    onStateButtonClick(data) {
        this.getAgent()?.set({state: data.component.reference})
    }

    /**
     * Paints the selected agent into the title, the state buttons and the details
     */
    refresh() {
        let me    = this,
            agent = me.getAgent(),
            title = me.getReference('title');

        // The items exist once the container constructed them
        if (!title) {
            return
        }

        title.vdom.cn = agent ? [
            {cls: ['neo-example-desk-inspector-name'], text: agent.name},
            {cls: ['neo-example-desk-inspector-role'], text: agent.role}
        ] : [{cls: ['neo-example-desk-inspector-role'], text: 'Select an agent in Swarm or Agents'}];

        title.update();

        states.forEach(({state}) => {
            me.getReference(state).set({disabled: !agent, pressed: agent?.state === state})
        });

        me.getReference('details').set({
            html: agent ? [
                ['Task',   agent.task],
                ['Tokens', agent.tokens.toLocaleString('en-US')],
                ['Merged', String(agent.merged)]
            ].map(([label, value]) => `<div class="neo-example-desk-inspector-row"><span>${label}</span><b>${value}</b></div>`).join('') : ''
        })
    }
}

export default Neo.setupClass(InspectorPane);
