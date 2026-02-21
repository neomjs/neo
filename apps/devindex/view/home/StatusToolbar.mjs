import Progress from '../../../../src/component/Progress.mjs';
import Toolbar  from '../../../../src/grid/footer/Toolbar.mjs';

/**
 * @class DevIndex.view.home.StatusToolbar
 * @extends Neo.grid.footer.Toolbar
 *
 * @summary A status toolbar for the DevIndex grid, displaying streaming progress and row counts.
 *
 * This component demonstrates the usage of `Neo.grid.footer.Toolbar` by implementing the
 * store event hooks (`onStoreLoad`, `onStoreProgress`, `onStoreFilter`).
 *
 * Key features:
 * - **Progressive Loading Indicator:** Uses a `Neo.component.Progress` to visualize data arrival from the
 *   `Neo.data.proxy.Stream`. The progress bar updates in real-time via `onStoreProgress`.
 * - **Visible Row Count:** Updates a label with the current number of records in the store
 *   whenever the store loads or filters change.
 * - **Auto-Hiding:** The progress bar automatically hides itself shortly after the load completes.
 */
class StatusToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.StatusToolbar'
         * @protected
         */
        className: 'DevIndex.view.home.StatusToolbar',
        /**
         * @member {String} ntype='devindex-status-toolbar'
         * @protected
         */
        ntype: 'devindex-status-toolbar',
        /**
         * @member {String[]} cls=['devindex-status-toolbar']
         */
        cls: ['devindex-status-toolbar'],
        /**
         * @member {String} dataMode_='total'
         */
        dataMode_: 'total',
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'label',
            reference: 'progress-label',
            text     : 'Streaming Users:'
        }, {
            module   : Progress,
            flex     : 'none',
            max      : 100,
            reference: 'progress',
            value    : 0,
            width    : 100
        }, {
            ntype    : 'button',
            cls      : ['devindex-stop-stream-button'],
            flex     : 'none',
            handler  : 'up.onStopButtonClick',
            height   : 22,
            iconCls  : 'fa fa-ban',
            reference: 'stop-button',
            text     : 'Stop',
            ui       : 'secondary'
        }, {
            ntype : 'container',
            cls   : ['devindex-stats-container'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype    : 'label',
                reference: 'total-contributions-label',
                text     : 'Total Contributions: 0'
            }, {
                ntype: 'label',
                text : '•'
            }, {
                ntype    : 'label',
                reference: 'count-rows-label',
                text     : 'Visible Rows: 0'
            }]
        }]
    }
    /**
     * @member {Intl.NumberFormat} numberFormatter=new Intl.NumberFormat()
     */
    numberFormatter = new Intl.NumberFormat()

    /**
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetDataMode(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateLabels()
        }
    }

    /**
     *
     */
    onStopButtonClick() {
        this.store.abort()
    }

    /**
     * @param {Object} data
     */
    onStoreFilter(data) {
        this.updateLabels()
    }

    /**
     * @param {Object} data
     */
    onStoreLoad(data) {
        let me = this;

        me.updateLabels();

        if (!data.isLoading) {
            me.timeout(500).then(() => {
                let progress      = me.getReference('progress');
                let progressLabel = me.getReference('progress-label');
                let stopButton    = me.getReference('stop-button');

                progress     .hidden = true;
                progressLabel.hidden = true;
                stopButton   .hidden = true
            })
        }
    }

    /**
     * @param {Object} data {loaded, total}
     */
    onStoreProgress(data) {
        let me = this;

        me.getReference('progress')?.set({
            hidden: false,
            max   : data.total || 100,
            value : data.total ? data.loaded : null // Indeterminate state if total is unknown
        });

        me.getReference('stop-button').hidden = false
    }

    /**
     *
     */
    updateLabels() {
        let me                = this,
            {dataMode, store} = me,
            {count, items}    = store,
            total             = 0,
            i                 = 0,
            item, labelText;

        switch (dataMode) {
            case 'commits':
                labelText = 'Total Commits';
                break;
            case 'private':
                labelText = 'Private Contributions';
                break;
            case 'public':
                labelText = 'Public Contributions';
                break;
            default: // total
                labelText = 'Total Contributions';
                break
        }

        for (; i < count; i++) {
            item = items[i];

            if (dataMode === 'commits') {
                total += (item.totalCommits ?? store.resolveField(item, 'totalCommits') ?? 0)
            } else if (dataMode === 'private') {
                total += (item.totalPrivateContributions ?? store.resolveField(item, 'totalPrivateContributions') ?? 0)
            } else if (dataMode === 'public') {
                total += (item.totalPublicContributions ?? store.resolveField(item, 'totalPublicContributions') ?? 0)
            } else { // total
                total += (item.tc ?? item.totalContributions ?? 0)
            }
        }

        me.getReference('count-rows-label')         .text = 'Visible Rows: ' + me.numberFormatter.format(count);
        me.getReference('total-contributions-label').text = `${labelText}: ${me.numberFormatter.format(total)}`
    }
}

export default Neo.setupClass(StatusToolbar);
