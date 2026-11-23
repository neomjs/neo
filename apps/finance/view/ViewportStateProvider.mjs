import CompanyStore  from '../store/Companies.mjs';
import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @summary Shared reactive state and Companies store owner for the Finance market desk viewport.
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
        data: {
            feedRunning : true,
            totalCount  : 0,
            visibleCount: 0
        },
        /**
         * @member {Object} formulas
         */
        formulas: {
            statusText: data => `${data.visibleCount} of ${data.totalCount} equities · ${data.feedRunning ? 'Live feed' : 'Paused'}`
        },
        /**
         * @member {Object} stores
         */
        stores: {
            companies: {
                module   : CompanyStore,
                autoLoad : true,
                listeners: {
                    filter: 'onCompaniesStoreFilter',
                    load  : 'onCompaniesStoreLoad'
                }
            }
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
