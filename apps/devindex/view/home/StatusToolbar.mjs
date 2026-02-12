import Progress from '../../../../src/component/Progress.mjs';
import Toolbar  from '../../../../src/grid/footer/Toolbar.mjs';

/**
 * @class DevIndex.view.home.StatusToolbar
 * @extends Neo.grid.footer.Toolbar
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
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Progress,
            flex     : 1,
            max      : 100,
            reference: 'progress',
            value    : 0
        }, {
            ntype: 'component',
            flex : 1
        }, {
            ntype    : 'label',
            reference: 'count-rows-label',
            style    : {marginLeft: '10px'},
            text     : 'Visible: 0'
        }]
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let me        = this,
            listeners = {
                filter  : me.updateRowsLabel,
                load    : me.onStoreLoad,
                progress: me.onStoreProgress,
                scope   : me
            };

        oldValue?.un(listeners);

        // Store might be passed as an instance or config
        if (value && value.on) {
            value.on(listeners);
        }

        return value
    }

    /**
     * @param {Object} data
     */
    onStoreLoad(data) {
        this.updateRowsLabel();

        let progress = this.getItem('progress');

        if (progress) {
            progress.value = progress.max;

            this.timeout(500).then(() => {
                 progress.hidden = true
            })
        }
    }

    /**
     * @param {Object} data {loaded, total}
     */
    onStoreProgress(data) {
        let progress = this.getItem('progress');

        if (progress) {
             progress.hidden = false;
             progress.max    = data.total || 100;
             progress.value  = data.loaded;

             // Indeterminate state if total is unknown
             if (!data.total) {
                 progress.value = null
             }
        }
    }

    /**
     *
     */
    updateRowsLabel() {
        let {store} = this;

        if (store) {
            this.getItem('count-rows-label').text = 'Visible: ' + store.count
        }
    }
}

export default Neo.setupClass(StatusToolbar);
