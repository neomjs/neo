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
     * @member {Intl.NumberFormat} currencyFormatter
     */
    currencyFormatter = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

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
                value : me.currencyFormatter.format(Math.round(Math.random() * 1000))
            })
        });

        this.getReference('grid').bulkUpdateRecords(items)
    }
}

export default Neo.setupClass(ViewportController);
