import Component      from '../../../src/component/Base.mjs';
import DashboardPanel from '../../../src/dashboard/Panel.mjs';
import {FORMATS}      from './kpis.mjs';
import Sparkline      from '../../../src/component/Sparkline.mjs';

/**
 * @summary One key figure as a dashboard tile: its latest reading, the change across the readings it holds, and a
 * sparkline of them. The tile shows the record of `kpiId` in `store` and follows that record's changes itself, so it
 * stays live wherever it is: in the dashboard, or in a window of its own after a drag out.
 * @class Neo.examples.dashboard.sortable.KpiTile
 * @extends Neo.dashboard.Panel
 */
class KpiTile extends DashboardPanel {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.sortable.KpiTile'
         * @protected
         */
        className: 'Neo.examples.dashboard.sortable.KpiTile',
        /**
         * @member {String[]} cls=['sortable-kpi-tile','neo-dashboard-panel','neo-panel','neo-container']
         * @reactive
         */
        cls: ['sortable-kpi-tile', 'neo-dashboard-panel', 'neo-panel', 'neo-container'],
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {
            cls   : ['sortable-kpi-body'],
            layout: {ntype: 'hbox', align: 'center'}
        },
        /**
         * The id of the record in `store` this tile shows.
         * @member {String|null} kpiId=null
         */
        kpiId: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Component,
            cls      : ['sortable-kpi-value'],
            reference: 'value'
        }, {
            module   : Component,
            cls      : ['sortable-kpi-change'],
            reference: 'change'
        }, {
            module   : Sparkline,
            flex     : 1,
            reference: 'sparkline'
        }],
        /**
         * The store holding the key figures. The tile listens to its record changes while it holds it.
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        oldValue?.un('recordChange', me.onRecordChange, me);

        if (value) {
            value.on('recordChange', me.onRecordChange, me);
            me.showRecord(value.get(me.kpiId))
        }
    }

    /**
     * @summary Lets go of the store's record changes before the tile goes.
     * @param {...*} args
     */
    destroy(...args) {
        this.store = null;
        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @param {Neo.data.Model} data.record
     * @protected
     */
    onRecordChange({record}) {
        record.id === this.kpiId && this.showRecord(record)
    }

    /**
     * @summary Shows a record: the latest reading as text, its change since the oldest reading held, coloured by
     * whether that change is good news for this figure, and all readings in the sparkline.
     * @param {Neo.data.Model|null} record
     * @protected
     */
    showRecord(record) {
        if (!record) return;

        let me               = this,
            {history, value} = record,
            first            = history[0],
            change           = first ? (value - first) / first * 100 : 0,
            good             = (change >= 0) === (record.rising === 'good'),
            changeLabel      = me.getReference('change');

        me.getReference('value').text = FORMATS[record.format](value);

        changeLabel.text = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)} %`;
        changeLabel.cls  = ['sortable-kpi-change', good ? 'sortable-good' : 'sortable-bad'];

        me.getReference('sparkline').values = [...history]
    }
}

export default Neo.setupClass(KpiTile);
