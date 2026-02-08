import ContributorModel from '../model/Contributor.mjs';
import Store            from '../../../src/data/Store.mjs';

/**
 * @class DevRank.store.Contributors
 * @extends Neo.data.Store
 */
class Contributors extends Store {
    static config = {
        /**
         * @member {String} className='DevRank.store.Contributors'
         * @protected
         */
        className: 'DevRank.store.Contributors',
        /**
         * @member {Neo.data.Model} model=ContributorModel
         */
        model: ContributorModel,
        /**
         * @member {String} keyProperty='login'
         */
        keyProperty: 'login',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Object[]} filters
         */
        filters: [
            {property: 'location', operator: 'like', value: null},
            {property: 'login',    operator: 'like', value: null},
            {property: 'name',     operator: 'like', value: null}
        ],
        /**
         * @member {Object[]} sorters
         */
        sorters: [
            {property: 'total_contributions', direction: 'DESC'}
        ],
        /**
         * @member {String} url='../../apps/devrank/resources/users.json'
         */
        url: '../../apps/devrank/resources/users.json'
    }
}

export default Neo.setupClass(Contributors);
