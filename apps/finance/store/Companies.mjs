import CompanyModel from '../model/Company.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
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
         * @member {Neo.data.model} model=CompanyModel
         */
        model: CompanyModel,
        /**
         * @member {String} url='../../apps/finance/resources/data/companies.json'
         */
        url: '../../apps/finance/resources/data/companies.json'
    }
}

export default Neo.setupClass(Companies);
