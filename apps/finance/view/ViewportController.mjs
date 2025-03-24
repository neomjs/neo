import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Finance.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Finance.view.ViewportController'
         * @protected
         */
        className: 'Finance.view.ViewportController'
    }

    /**
     *
     */
    onCompaniesStoreLoad() {
        let me             = this,
            companiesStore = me.getStore('companies'),
            items          = [];

        companiesStore.items.forEach(record => {
            items.push({
                symbol: record.symbol,
                value : Math.random() * 1000
            })
        });

        this.getReference('grid').bulkUpdateRecords(items)
    }
}

export default Neo.setupClass(ViewportController);
