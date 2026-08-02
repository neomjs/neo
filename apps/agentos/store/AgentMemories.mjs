import MemoryTurnModel from '../model/MemoryTurn.mjs';
import Store           from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.AgentMemories
 * @extends Neo.data.Store
 *
 * @summary Pane-local projection store for one agent's recent turn memories. Each MemoriesPane
 * owns its store and destroys it with the pane; memory history remains query-time on the plane and
 * no record survives the view/process lifecycle.
 */
class AgentMemories extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.AgentMemories'
         * @protected
         */
        className: 'AgentOS.store.AgentMemories',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=MemoryTurnModel
         * @reactive
         */
        model: MemoryTurnModel
    }
}

export default Neo.setupClass(AgentMemories);
