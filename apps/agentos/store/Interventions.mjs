import InterventionModel from '../model/Intervention.mjs';
import Store             from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.Interventions
 * @extends Neo.data.Store
 */
class Interventions extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.Interventions'
         * @protected
         */
        className: 'AgentOS.store.Interventions',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=InterventionModel
         * @reactive
         */
        model: InterventionModel,
        /**
         * @member {String} url=Neo.config.basePath + 'apps/agentos/resources/data/interventions.json'
         */
        url: Neo.config.basePath + 'apps/agentos/resources/data/interventions.json'
    }
}

export default Neo.setupClass(Interventions);
