import Button            from '../../../src/button/Base.mjs';
import GridFooterToolbar from '../../../src/grid/footer/Toolbar.mjs';
import Label             from '../../../src/component/Label.mjs';
import Progress          from '../../../src/component/Progress.mjs';
import {TOTAL_ROWS}      from './StreamConnection.mjs';

const format = new Intl.NumberFormat('en-US').format;

/**
 * @summary Displays live chunk-streaming row counts and progress via `onStoreProgress` alongside a "Load again" control.
 * @class Neo.examples.grid.streaming.FooterToolbar
 * @extends Neo.grid.footer.Toolbar
 */
class FooterToolbar extends GridFooterToolbar {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.streaming.FooterToolbar'
         * @protected
         */
        className: 'Neo.examples.grid.streaming.FooterToolbar',
        /**
         * @member {String[]} cls=['streaming-footer-toolbar']
         * @reactive
         */
        cls: ['streaming-footer-toolbar'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Label,
            cls      : ['streaming-status-label'],
            reference: 'statusLabel',
            text     : `0 / ${format(TOTAL_ROWS)} rows`
        }, {
            module   : Progress,
            cls      : ['streaming-progress'],
            max      : TOTAL_ROWS,
            reference: 'progressBar',
            value    : 0
        }, {
            cls  : ['streaming-footer-spacer'],
            flex : 1,
            ntype: 'component'
        }, {
            module   : Button,
            cls      : ['streaming-reload-button'],
            handler  : 'up.onLoadAgainClick',
            iconCls  : 'fa-solid fa-rotate-right',
            reference: 'loadAgainButton',
            text     : 'Load again'
        }]
    }

    /**
     * Latest byte-progress estimate mapped onto `[0, TOTAL_ROWS]`.
     * @member {Number} #byteEstimate=0
     * @private
     */
    #byteEstimate = 0

    /**
     * @summary Syncs the initial progress display when a store arrives after construction.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        value && this.getItem('statusLabel') && this.syncProgress()
    }

    /**
     * @summary Binds `mutate` alongside `GridFooterToolbar` store hooks so `clear()` updates the footer to 0 rows.
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store|Object|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        const
            me        = this,
            listeners = {mutate: me.onStoreMutate, scope: me};

        oldValue?.un(listeners);

        const result = super.beforeSetStore(value, oldValue);

        if (result?.on) {
            result.on(listeners)
        } else if (result) {
            result.listeners ??= {};
            Object.assign(result.listeners, listeners)
        }

        return result
    }

    /**
     * @summary Releases store listeners cleanly before destruction.
     * @param {...*} args
     */
    destroy(...args) {
        this.store = null;
        super.destroy(...args)
    }

    /**
     * @summary Updates status and progress when the toolbar first mounts with a bound store.
     */
    onConstructed() {
        super.onConstructed();
        this.store && this.syncProgress()
    }

    /**
     * @summary Refreshes footer text whenever active filters change row counts.
     */
    onStoreFilter() {
        this.syncProgress()
    }

    /**
     * @summary Reflects committed rows from each chunk and stream completion in the footer.
     */
    onStoreLoad() {
        this.syncProgress()
    }

    /**
     * @summary Resets progress immediately when `store.clear()` empties rows before restart.
     */
    onStoreMutate() {
        if (!this.store?.getCount()) {
            this.#byteEstimate = 0;
            this.syncProgress()
        }
    }

    /**
     * @summary Reflects incoming stream byte progress from `Neo.data.parser.Stream` in the footer bar.
     * @param {Object} data `{loaded, total}` bytes delivered by the stream parser
     */
    onStoreProgress(data) {
        if (data?.total > 0) {
            this.#byteEstimate = Math.min(TOTAL_ROWS, Math.round(TOTAL_ROWS * (data.loaded / data.total)))
        }

        this.syncProgress()
    }

    /**
     * @summary Updates the status label and progress value to match the store's current streamed row count.
     */
    syncProgress() {
        const
            me    = this,
            store = me.store,
            label = me.getItem('statusLabel'),
            bar   = me.getItem('progressBar');

        if (!store || !label || !bar) {
            return
        }

        const
            count     = store.getCount(),
            streaming = !!(store.isStreaming || store.isLoading),
            progress  = streaming ? Math.max(count, me.#byteEstimate) : count;

        if (!streaming) {
            me.#byteEstimate = count
        }

        label.text = streaming
            ? `Streaming ${format(count)} / ${format(TOTAL_ROWS)} rows`
            : `${format(count)} / ${format(TOTAL_ROWS)} rows`;

        bar.value = Math.min(TOTAL_ROWS, progress)
    }
}

export default Neo.setupClass(FooterToolbar);
