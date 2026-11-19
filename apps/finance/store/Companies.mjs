import CompanyModel from '../model/Company.mjs';
import SearchFilter from '../../../src/collection/SearchFilter.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @summary Keyed equity store supporting instant local search across ticker, company name, and sector.
 * @class Finance.store.Companies
 * @extends Neo.data.Store
 */
class Companies extends Store {
    static config = {
        /**
         * @member {String} className='Finance.store.Companies'
         * @protected
         */
        className: 'Finance.store.Companies',
        /**
         * @member {Object[]} filters
         * @reactive
         */
        filters: [{
            module   : SearchFilter,
            ownerRole: 'finance-search',
            property : null,
            fields   : ['symbol', 'name', 'sector'],
            value    : ''
        }],
        /**
         * @member {String} keyProperty='symbol'
         */
        keyProperty: 'symbol',
        /**
         * @member {Neo.data.Model} model=CompanyModel
         */
        model: CompanyModel,
        /**
         * @member {Object[]} sorters=[{property:'name',direction:'ASC'}]
         */
        sorters: [{
            property : 'name',
            direction: 'ASC'
        }],
        /**
         * @member {String} url='../../apps/finance/resources/data/companies.json'
         */
        url: '../../apps/finance/resources/data/companies.json'
    }
}

export default Neo.setupClass(Companies);
