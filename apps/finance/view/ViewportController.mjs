import Controller from '../../../src/controller/Component.mjs';

/**
 * @summary Drives deterministic quote seeding, live ticker updates, search filtering, and interval lifecycle cleanup.
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
     * @summary Clears any active ticker interval before tearing down the controller.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        if (me.intervalId !== null) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }

        super.destroy(...args)
    }

    /**
     * @summary Starts the live quote simulation timer, replacing any active timer cleanly.
     */
    generateData() {
        let me = this;

        if (me.intervalId !== null) {
            clearInterval(me.intervalId)
        }

        me.intervalId = setInterval(() => me.updateRecord(), 40)
    }

    /**
     * @summary Updates visible equity count when the Companies store filter changes.
     */
    onCompaniesStoreFilter() {
        const me    = this,
              store = me.getStore('companies');

        if (!me.isDestroyed && store) {
            me.setState({visibleCount: store.getCount()})
        }
    }

    /**
     * @summary Seeds initial deterministic prices, changes, and volumes across loaded records and begins streaming ticks.
     */
    onCompaniesStoreLoad() {
        const me             = this,
              companiesStore = me.getStore('companies'),
              items          = [];

        companiesStore.forEach((record, index) => {
            items.push(me.seedQuote(record.symbol, index))
        });

        me.getReference('grid').bulkUpdateRecords(items);
        me.setState({
            feedRunning : true,
            totalCount  : companiesStore.getCount(),
            visibleCount: companiesStore.getCount()
        });
        me.generateData()
    }

    /**
     * @summary Updates the shared Companies SearchFilter query from the toolbar search field.
     * @param {Object} data
     * @param {String} data.value
     */
    onSearchChange({value}) {
        const filter = this.getStore('companies')?.getFilter(null, 'finance-search');

        if (filter) {
            filter.value = value ?? ''
        }
    }

    /**
     * @summary Resumes live quote simulation ticks and syncs toolbar button + status state.
     * @param {Object} data
     */
    onStartButtonClick(data) {
        const me         = this,
              stopButton = me.getReference('stop-button');

        me.generateData();
        me.setState({feedRunning: true});

        data.component.disabled = true;
        stopButton    .disabled = false
    }

    /**
     * @summary Pauses live quote simulation ticks and syncs toolbar button + status state.
     * @param {Object} data
     */
    onStopButtonClick(data) {
        const me          = this,
              startButton = me.getReference('start-button');

        if (me.intervalId !== null) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }

        me.setState({feedRunning: false});

        data.component.disabled = true;
        startButton   .disabled = false
    }

    /**
     * @summary Derives a deterministic opening quote tuple for a ticker symbol and list index.
     * @param {String} symbol
     * @param {Number} index
     * @returns {{change: Number, changePercent: Number, priorClose: Number, symbol: String, tickDelta: Number, value: Number, volume: Number}}
     */
    seedQuote(symbol, index) {
        let hash = 17 + index * 31;

        for (let i = 0; i < (symbol?.length || 0); i++) {
            hash = (hash * 33 + symbol.charCodeAt(i)) % 100000
        }

        const value         = Number((45 + (hash % 83500) / 100).toFixed(2)),
              rawChange     = Number((((hash % 137) - 65) / 10).toFixed(2)),
              priorClose    = Number(Math.max(1, value - rawChange).toFixed(2)),
              change        = Number((value - priorClose).toFixed(2)),
              changePercent = Number(((change / priorClose) * 100).toFixed(2)),
              tickDelta     = change,
              volume        = 2_400_000 + (hash % 656) * 100_000;

        return {change, changePercent, priorClose, symbol, tickDelta, value, volume}
    }

    /**
     * @summary Applies one bounded price/volume tick against the currently visible (possibly filtered) store slice,
     * keeping day `change` and `changePercent` consistently anchored to `priorClose` while recording the actual tick move in `tickDelta`.
     */
    updateRecord() {
        const me    = this,
              store = me.getStore('companies'),
              count = store?.getCount() || 0;

        if (!count) {
            return
        }

        const record = store.getAt(Math.floor(Math.random() * count));

        if (!record) {
            return
        }

        const prevValue     = record.value,
              rawDelta      = Number((Math.random() * 8 - 4).toFixed(2)),
              nextValue     = Math.max(5, Number((prevValue + rawDelta).toFixed(2))),
              tickDelta     = Number((nextValue - prevValue).toFixed(2)),
              priorClose    = record.priorClose > 0 ? record.priorClose : Number(Math.max(1, prevValue - (record.change || 0)).toFixed(2)),
              change        = Number((nextValue - priorClose).toFixed(2)),
              changePercent = Number(((change / priorClose) * 100).toFixed(2)),
              volume        = (record.volume || 0) + Math.round(Math.abs(tickDelta) * 12500);

        record.set({change, changePercent, priorClose, tickDelta, value: nextValue, volume})
    }
}

export default Neo.setupClass(ViewportController);
