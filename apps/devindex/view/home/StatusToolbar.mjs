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
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'label',
            reference: 'progress-label',
            text     : 'Streaming Users:'
        }, {
            module   : Progress,
            flex     : 1,
            max      : 100,
            reference: 'progress',
            style    : {marginLeft: '10px'},
            value    : 0
        }, {
            ntype: 'component',
            flex : 1
        }, {
            ntype    : 'label',
            reference: 'count-rows-label',
            text     : 'Visible Rows: 0'
        }]
    }

    /**
     * @param {Object} data
     */
    onStoreLoad(data) {
        let me = this;

        me.updateRowsLabel();

        if (!data.isLoading) {
            me.timeout(500).then(() => {
                let progress      = me.getReference('progress');
                let progressLabel = me.getReference('progress-label');

                progress     .hidden = true;
                progressLabel.hidden = true
            })
        }
    }

    /**
     * @param {Object} data
     */
    onStoreFilter(data) {
        this.updateRowsLabel()
    }

    /**
     * @param {Object} data {loaded, total}
     */
    onStoreProgress(data) {
        this.getReference('progress')?.set({
            hidden: false,
            max   : data.total || 100,
            value : data.total ? data.loaded : null // Indeterminate state if total is unknown
        })
    }

    /**
     *
     */
    updateRowsLabel() {
        this.getReference('count-rows-label').text = 'Visible Rows: ' + this.store.count
    }
}

export default Neo.setupClass(StatusToolbar);
