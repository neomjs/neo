import Component from '../../../../src/component/Base.mjs';

/**
 * @summary App Worker test surface that exercises `Neo.main.addon.Clipboard` across the real worker boundary.
 * @class Test.Component.Main.ClipboardSurface
 * @extends Neo.component.Base
 */
class ClipboardSurface extends Component {
    static config = {
        /**
         * @member {String} className='Test.Component.Main.ClipboardSurface'
         * @protected
         */
        className: 'Test.Component.Main.ClipboardSurface',
        /**
         * True once `Clipboard.register()` resolves on the target window's main thread.
         * @member {Boolean} addonRegistered=false
         */
        addonRegistered: false,
        /**
         * Simulated async worker delay in ms before `fulfillWrite` or `cancelWrite` responds.
         * @member {Number} copyDelayMs=80
         */
        copyDelayMs: 80,
        /**
         * Optional multi-MIME map passed to `fulfillWrite({items})`.
         * @member {Object|null} copyItems=null
         */
        copyItems: null,
        /**
         * Plain-text payload passed to `fulfillWrite({text})` on `copy`.
         * @member {String} copyText='worker-copied-payload'
         */
        copyText: 'worker-copied-payload',
        /**
         * Reason supplied to `cancelWrite` when `cutMode` is `'cancel'`.
         * @member {String} cutCancelReason='cut-disallowed'
         */
        cutCancelReason: 'cut-disallowed',
        /**
         * `'cancel'` or `'fulfill'` disposition for `cut` events.
         * @member {String} cutMode='cancel'
         */
        cutMode: 'cancel',
        /**
         * Plain-text payload passed to `fulfillWrite({text})` when `cutMode` is `'fulfill'`.
         * @member {String} cutText='worker-cut-payload'
         */
        cutText: 'worker-cut-payload',
        /**
         * Forwarded to `Clipboard.register({ignoreEditableTargets})`.
         * @member {Boolean} ignoreEditableTargets=true
         */
        ignoreEditableTargets: true,
        /**
         * Forwarded to `Clipboard.register({mimeTypes})`.
         * @member {String[]} mimeTypes=['text/plain']
         */
        mimeTypes: ['text/plain'],
        /**
         * Recorded clipboard event log inside the App Worker.
         * @member {Object[]|null} receivedEvents=null
         */
        receivedEvents: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cls     : ['neo-clipboard-test-surface'],
            tabIndex: 0,
            cn      : [{
                cls     : ['clipboard-row'],
                tabIndex: 0,
                text    : 'Selected Row Label'
            }, {
                cls  : ['clipboard-editor'],
                tag  : 'input',
                type : 'text',
                value: 'Editable Input Seed'
            }]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        const me = this;

        me.receivedEvents = [];

        config.domListeners = [
            {copy : me.onCopy,  delegate: '.clipboard-row', scope: me},
            {cut  : me.onCut,                               scope: me},
            {paste: me.onPaste,                             scope: me}
        ];

        super.construct(config)
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const me = this;

        if (value) {
            me.registerClipboard()
        } else if (oldValue) {
            me.addonRegistered = false;
            Neo.currentWorker.getAddon('Clipboard', me.windowId)
                .then(addon => addon.unregister({componentId: me.id, id: me.id, windowId: me.windowId}))
                .catch(Neo.emptyFn)
        }
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        const me = this;

        if (me.mounted) {
            Neo.currentWorker.getAddon('Clipboard', me.windowId)
                .then(addon => addon.unregister({componentId: me.id, id: me.id, windowId: me.windowId}))
                .catch(Neo.emptyFn)
        }

        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onCopy(data) {
        const me = this;

        me.receivedEvents.push({
            currentTarget: data.currentTarget,
            mimeTypes    : data.mimeTypes,
            requestId    : data.requestId,
            type         : 'copy'
        });

        if (me.copyDelayMs > 0) {
            await me.timeout(me.copyDelayMs)
        }

        const addon = await Neo.currentWorker.getAddon('Clipboard', me.windowId);

        await addon.fulfillWrite({
            items    : me.copyItems,
            requestId: data.requestId,
            text     : me.copyText,
            windowId : me.windowId
        })
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onCut(data) {
        const me = this;

        me.receivedEvents.push({
            currentTarget: data.currentTarget,
            mimeTypes    : data.mimeTypes,
            requestId    : data.requestId,
            type         : 'cut'
        });

        if (me.copyDelayMs > 0) {
            await me.timeout(me.copyDelayMs)
        }

        const addon = await Neo.currentWorker.getAddon('Clipboard', me.windowId);

        if (me.cutMode === 'cancel') {
            await addon.cancelWrite({
                reason   : me.cutCancelReason,
                requestId: data.requestId,
                windowId : me.windowId
            })
        } else {
            await addon.fulfillWrite({
                requestId: data.requestId,
                text     : me.cutText,
                windowId : me.windowId
            })
        }
    }

    /**
     * @param {Object} data
     */
    onPaste(data) {
        this.receivedEvents.push({
            currentTarget: data.currentTarget,
            items        : data.items,
            text         : data.text,
            type         : 'paste'
        })
    }

    /**
     * @returns {Promise<void>}
     */
    async registerClipboard() {
        const
            me    = this,
            addon = await Neo.currentWorker.getAddon('Clipboard', me.windowId);

        me.addonRegistered = await addon.register({
            componentId          : me.id,
            id                   : me.id,
            ignoreEditableTargets: me.ignoreEditableTargets,
            mimeTypes            : me.mimeTypes,
            windowId             : me.windowId
        })
    }
}

export default Neo.setupClass(ClipboardSurface);
