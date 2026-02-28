import ContributorModel from '../model/Contributor.mjs';
import Store            from '../../../src/data/Store.mjs';
import StreamProxy      from '../../../src/data/proxy/Stream.mjs';

/**
 * @class DevIndex.store.Contributors
 * @extends Neo.data.Store
 */
class Contributors extends Store {
    static config = {
        /**
         * @member {String} className='DevIndex.store.Contributors'
         * @protected
         */
        className: 'DevIndex.store.Contributors',
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
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * @member {Object[]} filters
         */
        filters: [
            {property: 'bio',         operator: 'like', value: null},
            {property: 'commitRatio', operator: '<=',   value: null},
            {property: 'countryCode', operator: '===',  value: null},
            {property: 'isHireable',  operator: '===',  value: null},
            {property: 'login',       operator: 'like', value: null},
            {property: 'name',        operator: 'like', value: null}
        ],
        /**
         * @member {Object} proxy
         */
        proxy: {
            module: StreamProxy,
            progressiveChunkSize: true,
            url   : Neo.config.basePath + 'apps/devindex/resources/data/users.jsonl'
        },
        /**
         * @member {Object[]} sorters
         */
        sorters: [
            {property: 'totalContributions', direction: 'DESC'}
        ]
    }
}

export default Neo.setupClass(Contributors);
