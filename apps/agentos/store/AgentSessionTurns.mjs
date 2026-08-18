import SessionTurnModel from '../model/SessionTurn.mjs';
import Store            from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.AgentSessionTurns
 * @extends Neo.data.Store
 *
 * @summary Pane-local projection store for one session's turn-level memories — the drill-in
 * depth below {@link AgentOS.store.AgentSessionSummaries}. Each MemoriesPane owns its store and
 * destroys it with the pane; the memory corpus remains query-time on the plane and no record
 * survives the view/process lifecycle.
 */
class AgentSessionTurns extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.AgentSessionTurns'
         * @protected
         */
        className: 'AgentOS.store.AgentSessionTurns',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=SessionTurnModel
         * @reactive
         */
        model: SessionTurnModel
    }
}

export default Neo.setupClass(AgentSessionTurns);
