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
     * @member {Number|null} intervalId=null
     */
    intervalId = null

    /**
     *
     */
    generateData() {
        let me = this;

        me.intervalId = setInterval(me.updateRecord.bind(me), 4)
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

        me.getReference('grid').bulkUpdateRecords(items);
        me.generateData()
    }

    /**
     * @param {Object} data
     */
    onStartButtonClick(data) {
        let me         = this,
            stopButton = me.getReference('stop-button');

        me.generateData();

        data.component.disabled = true;
        stopButton    .disabled = false
    }

    /**
     * @param {Object} data
     */
    onStopButtonClick(data) {
        let me          = this,
            startButton = me.getReference('start-button');

        clearInterval(me.intervalId);

        data.component.disabled = true;
        startButton   .disabled = false
    }

    /**
     *
     */
    updateRecord() {
        let me     = this,
            store  = me.getStore('companies'),
            change = Math.random() * 10 - 5,
            index  = Math.round(Math.random() * 100), // 0 - 100
            record = store.getAt(index);

        record.set({change, value: record.value + change})
    }
}

export default Neo.setupClass(ViewportController);
