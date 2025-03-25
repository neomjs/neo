import CompanyStore  from '../store/Companies.mjs';
import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class Finance.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Finance.view.ViewportStateProvider'
         * @protected
         */
        className: 'Finance.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {},
        /**
         * @member {Object} stores
         */
        stores: {
            companies: {
                module   : CompanyStore,
                autoLoad : true,
                listeners: {load: 'onCompaniesStoreLoad'}
            }
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
