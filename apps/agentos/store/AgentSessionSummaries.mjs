import SessionSummaryModel from '../model/SessionSummary.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.AgentSessionSummaries
 * @extends Neo.data.Store
 *
 * @summary Pane-local projection store for one agent's session summaries. Each MemoriesPane owns
 * its store and destroys it with the pane; the summary corpus remains query-time on the plane and
 * no record survives the view/process lifecycle.
 */
class AgentSessionSummaries extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.AgentSessionSummaries'
         * @protected
         */
        className: 'AgentOS.store.AgentSessionSummaries',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=SessionSummaryModel
         * @reactive
         */
        model: SessionSummaryModel
    }
}

export default Neo.setupClass(AgentSessionSummaries);
