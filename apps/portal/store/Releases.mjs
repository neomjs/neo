import ReleaseModel from '../model/Release.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.Releases
 * @extends Neo.data.Store
 */
class Releases extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Releases'
         * @protected
         */
        className: 'Portal.store.Releases',
        /**
         * @member {String} keyProperty='version'
         */
        keyProperty: 'version',
        /**
         * @member {Neo.data.Model} model=ReleaseModel
         * @reactive
         */
        model: ReleaseModel,
        /**
         * @member {Object[]} sorters=[{property:'version',direction:'DESC'}]
         */
        sorters: [{
            property : 'version',
            direction: 'DESC'
        }],
        /**
         * @member {String} url='../../apps/portal/resources/data/releases.json'
         */
        url: '../../apps/portal/resources/data/releases.json'
    }
}

export default Neo.setupClass(Releases);
