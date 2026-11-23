import Component from '../../../../src/component/Base.mjs';

/**
 * @summary App Worker test surface that exercises both plain `domListeners` and `Neo.main.addon.Clipboard` across the worker boundary.
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
         * Plain-text payload passed to `fulfillWrite({text})` on `copy` when non-null.
         * @member {String|null} copyText='worker-copied-payload'
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
         * Boolean outcome resolved by the most recent `addon.fulfillWrite(...)` call.
         * @member {Boolean|null} lastFulfillResult=null
         */
        lastFulfillResult: null,
        /**
         * Forwarded to `Clipboard.register({mimeTypes})`.
         * @member {String[]} mimeTypes_=['text/plain']
         * @reactive
         */
        mimeTypes_: ['text/plain'],
        /**
         * Recorded clipboard (and plain-mode `click`) event log inside the App Worker.
         * @member {Object[]|null} receivedEvents=null
         */
        receivedEvents: null,
        /**
         * When `false`, the component never loads or registers with `Neo.main.addon.Clipboard`, testing plain `dev` `domListeners`.
         * @member {Boolean} registerWithAddon=true
         */
        registerWithAddon: true,
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
     * @summary Initializes the event log and binds `copy`, `cut`, and `paste` (plus `click` in plain mode) DOM listeners.
     * @param {Object} config
     */
    construct(config) {
        const me = this;

        me.receivedEvents = [];

        const listeners = [
            {copy : me.onCopy,  delegate: '.clipboard-row', scope: me},
            {cut  : me.onCut,                               scope: me},
            {paste: me.onPaste,                             scope: me}
        ];

        if (config.registerWithAddon === false) {
            listeners.unshift({click: me.onClick, delegate: '.clipboard-row', scope: me})
        }

        config.domListeners = listeners;

        super.construct(config)
    }

    /**
     * @summary Re-registers the target MIME list on the main thread when `mimeTypes` changes while mounted.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    afterSetMimeTypes(value, oldValue) {
        if (oldValue !== undefined && this.mounted && this.registerWithAddon) {
            this.addonRegistered = false;
            this.registerClipboard()
        }
    }

    /**
     * @summary Registers or unregisters the main-thread `Clipboard` target on mount transitions when `registerWithAddon` is enabled.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const me = this;

        if (!me.registerWithAddon) {
            return
        }

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
     * @summary Unregisters the main-thread `Clipboard` target before component teardown when `registerWithAddon` is enabled.
     * @param {...*} args
     */
    destroy(...args) {
        const me = this;

        if (me.mounted && me.registerWithAddon) {
            Neo.currentWorker.getAddon('Clipboard', me.windowId)
                .then(addon => addon.unregister({componentId: me.id, id: me.id, windowId: me.windowId}))
                .catch(Neo.emptyFn)
        }

        super.destroy(...args)
    }

    /**
     * @summary Records `click` events when testing plain `domListeners` without the addon.
     * @param {Object} data
     */
    onClick(data) {
        this.receivedEvents.push({
            currentTarget: data.currentTarget,
            type         : 'click'
        })
    }

    /**
     * @summary Records the incoming `copy` gesture and fulfills the pending write when `requestId` is present.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onCopy(data) {
        const me = this;

        me.receivedEvents.push({
            currentTarget: data.currentTarget,
            mimeTypes    : data.mimeTypes ?? null,
            requestId    : data.requestId ?? null,
            type         : 'copy'
        });

        if (!data.requestId) {
            return
        }

        if (me.copyDelayMs > 0) {
            await me.timeout(me.copyDelayMs)
        }

        const
            addon   = await Neo.currentWorker.getAddon('Clipboard', me.windowId),
            payload = {
                requestId: data.requestId,
                windowId : me.windowId
            };

        if (me.copyItems !== null) {
            payload.items = me.copyItems
        }

        if (me.copyText !== null) {
            payload.text = me.copyText
        }

        me.lastFulfillResult = await addon.fulfillWrite(payload)
    }

    /**
     * @summary Records the incoming `cut` gesture and cancels or fulfills the pending write when `requestId` is present.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onCut(data) {
        const me = this;

        me.receivedEvents.push({
            currentTarget: data.currentTarget,
            mimeTypes    : data.mimeTypes ?? null,
            requestId    : data.requestId ?? null,
            type         : 'cut'
        });

        if (!data.requestId) {
            return
        }

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
            me.lastFulfillResult = await addon.fulfillWrite({
                requestId: data.requestId,
                text     : me.cutText,
                windowId : me.windowId
            })
        }
    }

    /**
     * @summary Records the incoming `paste` event.
     * @param {Object} data
     */
    onPaste(data) {
        this.receivedEvents.push({
            currentTarget: data.currentTarget,
            items        : data.items ?? null,
            text         : data.text ?? null,
            type         : 'paste'
        })
    }

    /**
     * @summary Registers this component's root element with `Neo.main.addon.Clipboard`.
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
