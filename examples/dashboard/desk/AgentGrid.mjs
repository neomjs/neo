import GridContainer from '../../../src/grid/Container.mjs';

/**
 * @summary A grid over the desk's agents that shares one selection with every other pane.
 *
 * A row click writes the agent's id into the desk's `agentId`, and a change of `agentId` from any other pane selects
 * its row here. Two panes show this grid with different columns (Swarm: the live work, Agents: the roster), and both
 * follow the same selection through every drag and perspective switch, because the selection lives in the provider,
 * not in a pane.
 * @class Neo.examples.dashboard.desk.AgentGrid
 * @extends Neo.grid.Container
 */
class AgentGrid extends GridContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.AgentGrid'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.AgentGrid',
        /**
         * The selected agent, kept in step with the desk
         * @member {String|null} agentId_=null
         */
        agentId_: null,
        /**
         * @member {Object} bind
         */
        bind: {
            agentId: data => data.agentId,
            store  : 'stores.agents'
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAgentId(value, oldValue) {
        this.syncSelection()
    }

    /**
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        super.afterSetStore(value, oldValue);
        this.syncSelection()
    }

    /**
     * Subscribes to the row selection, which `grid.View` owns across all bodies
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.view.on({select: me.onRowSelect, scope: me});
        me.syncSelection()
    }

    /**
     * @param {Object}         data
     * @param {Neo.data.Model} data.record
     * @protected
     */
    onRowSelect({record}) {
        this.setState('agentId', record.id)
    }

    /**
     * Selects the desk's agent here, once the view, the store and the agent are all known. A row is selected by the
     * body's record id, which is not the agent's `id`.
     * @protected
     */
    syncSelection() {
        let {agentId, store, view} = this,
            selectionModel         = view?.selectionModel,
            record                 = agentId && store?.get?.(agentId),
            recordId;

        if (record && selectionModel) {
            recordId = view.getRecordId(record);

            recordId != null && !selectionModel.isSelectedRow(recordId) && selectionModel.selectRow(recordId)
        }
    }
}

export default Neo.setupClass(AgentGrid);
