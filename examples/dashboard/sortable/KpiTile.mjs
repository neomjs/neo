import Button         from '../../../src/button/Base.mjs';
import Component      from '../../../src/component/Base.mjs';
import DashboardPanel from '../../../src/dashboard/Panel.mjs';
import {FORMATS}      from './kpis.mjs';
import Sparkline      from '../../../src/component/Sparkline.mjs';

/**
 * @summary One key figure as a dashboard tile: its latest reading, the change across the readings it holds, and a
 * sparkline of them. The tile shows the record of `kpiId` in `store` and follows that record's changes itself, so it
 * stays live wherever it is: in the dashboard, or in a window of its own.
 *
 * Its title bar shows both of its actions: a grip to drag it by, and a button that opens it in its own window
 * through its `dashboard` (`Neo.dashboard.Container#openWidgetInPopup`, the call a drag out of the window ends in)
 * and, once it is there, brings it back.
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
         * False hides the window button, for a device on which a window cannot open.
         * @member {Boolean} canOpenWindow=true
         */
        canOpenWindow: true,
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
            layout: {ntype: 'hbox', align: 'stretch'}
        },
        /**
         * The dashboard the tile belongs to, also while it is in a window of its own. The view controller assigns it.
         * @member {Neo.dashboard.Container|null} dashboard=null
         */
        dashboard: null,
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
            flex     : 'none',
            reference: 'value'
        }, {
            module   : Component,
            cls      : ['sortable-kpi-change'],
            flex     : 'none',
            reference: 'change'
        }, {
            module      : Sparkline,
            // The hover readout labels each reading with a year, which per-second readings do not have
            domListeners: [],
            flex        : 1,
            reference   : 'sparkline',
            usePulse    : false
        }],
        /**
         * The title bar's text.
         * @member {String|null} label=null
         */
        label: null,
        /**
         * The store holding the key figures. The tile listens to its record changes while it holds it.
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null
    }

    /**
     * @summary Builds the title bar: the grip and the label, which the dashboard's drag starts on, and the window
     * button at its end.
     * @param {Object} config
     */
    construct(config) {
        config.headers ??= [{
            dock : 'top',
            cls  : ['neo-draggable', 'sortable-kpi-header'],
            items: [{
                module: Component,
                cls   : ['sortable-kpi-grip', 'fa-solid', 'fa-grip-vertical'],
                tag   : 'span'
            }, {
                ntype: 'label',
                text : config.label
            }, '->', {
                module   : Button,
                ariaLabel: 'Open in its own window',
                cls      : ['sortable-kpi-window-button'],
                handler  : 'up.onWindowButtonClick',
                hidden   : config.canOpenWindow === false,
                iconCls  : 'fa-solid fa-up-right-from-square',
                reference: 'window-button',
                ui       : 'ghost'
            }]
        }];

        super.construct(config)
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
     * @summary Keeps the window button's icon and label in step with where the tile is.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        this.syncWindowButton()
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
     * @returns {Boolean} True while the tile is in a window of its own
     */
    isDetached() {
        let {dashboard} = this;

        return !!dashboard && this.windowId !== dashboard.windowId
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
     * @summary Opens the tile in its own window where it stands, or, from that window, returns it to the dashboard.
     * Closing the window returns the tile, so both directions use the dashboard's own detach and return.
     * @protected
     */
    async onWindowButtonClick() {
        let me          = this,
            {dashboard} = me,
            rect;

        if (!dashboard) return;

        if (me.isDetached()) {
            await Neo.Main.windowClose({names: me.reference || me.id, windowId: dashboard.windowId})
        } else {
            rect = await me.getDomRect();

            // The window adds a title bar, which a drag out of the window also adds to the rect it opens at
            rect.height += 50;

            await dashboard.openWidgetInPopup(me, rect)
        }
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

    /**
     * @summary Points the window button at the other direction: out of the dashboard, or back into it.
     * @protected
     */
    syncWindowButton() {
        let me       = this,
            button   = me.getReference('window-button'),
            detached = me.isDetached();

        button?.set({
            ariaLabel: detached ? 'Return to the dashboard' : 'Open in its own window',
            iconCls  : detached ? 'fa-solid fa-right-to-bracket' : 'fa-solid fa-up-right-from-square'
        })
    }
}

export default Neo.setupClass(KpiTile);
