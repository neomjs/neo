import Base from './Base.mjs';

/**
 * Input types that do not host native text selection or text editing.
 * @type {Set<String>}
 */
const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit'
]);

/**
 * @summary Main-thread clipboard bridge for App Worker `copy`, `cut`, and `paste` gestures.
 *
 * Browsers require clipboard writes to bind inside a synchronous user gesture on the main thread, while
 * application state in Neo lives inside the App Worker. On `copy` and `cut`, this addon synchronously
 * submits a `ClipboardItem` backed by controllable `Promise<Blob>` entries before forwarding the event
 * to the App Worker, which later resolves (`fulfillWrite`) or aborts (`cancelWrite`) the pending item.
 * On `paste`, `event.clipboardData` is read synchronously inside the event turn and forwarded to the
 * App Worker without invoking `navigator.clipboard.readText()`. Native editable descendants (`<input>`,
 * `<textarea>`, and `[contenteditable]`) bypass the addon by default so standard text editing stays intact.
 *
 * @class Neo.main.addon.Clipboard
 * @extends Neo.main.addon.Base
 */
class Clipboard extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Clipboard'
         * @protected
         */
        className: 'Neo.main.addon.Clipboard',
        /**
         * Default timeout in ms before an unfulfilled outbound clipboard write aborts cleanly.
         * @member {Number} defaultPendingTimeoutMs=10000
         */
        defaultPendingTimeoutMs: 10000,
        /**
         * No external library files need to delay remote readiness.
         * @member {Boolean} preloadFilesDelay=false
         * @protected
         */
        preloadFilesDelay: false,
        /**
         * Number of 100ms retries when `register()` runs before the target DOM node is mounted.
         * @member {Number} registerAttempts=3
         */
        registerAttempts: 3,
        /**
         * Remote method access for the App Worker.
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'cancelWrite',
                'fulfillWrite',
                'register',
                'unregister'
            ]
        }
    }

    /**
     * In-flight outbound clipboard writes keyed by `requestId`.
     * @member {Map<String, Object>} #pendingWrites=new Map()
     * @private
     */
    #pendingWrites = new Map()
    /**
     * Monotonic tokens per `${id}::${ownerKey}` guarding async mount retries against concurrent teardown.
     * @member {Map<String, Number>} #registrationTokens=new Map()
     * @private
     */
    #registrationTokens = new Map()
    /**
     * Monotonic counter for outbound clipboard `requestId` values.
     * @member {Number} #requestSequence=0
     * @private
     */
    #requestSequence = 0
    /**
     * Active DOM target groups keyed by target `id`.
     * @member {Map<String, Object>} #targets=new Map()
     * @private
     */
    #targets = new Map()
    /**
     * Monotonic counter for `#registrationTokens`.
     * @member {Number} #tokenSequence=0
     * @private
     */
    #tokenSequence = 0

    /**
     * @summary Serializes the DOM ancestor chain for App Worker `DomEvent` delegation and bubbling.
     * @param {Element|Node|Object|null} target
     * @param {String} eventName
     * @returns {Object[]}
     * @protected
     */
    buildEventPath(target, eventName) {
        const element = target?.nodeType === 3 ? (target.parentElement || target.parentNode) : target;

        if (!element) {
            return []
        }

        const domEvents = Neo.main?.DomEvents;

        if (domEvents?.getPathFromElement && domEvents?.getTargetData) {
            return domEvents.getPathFromElement(element).map(node => domEvents.getTargetData(node))
        }

        const path = [];

        for (let node = element; node; node = node.parentNode) {
            path.push({
                cls              : node.classList ? [...node.classList] : [],
                data             : {...node.dataset},
                id               : Neo.config?.useDomIds === false ? node.dataset?.neoId : node.id,
                isContentEditable: Boolean(node.isContentEditable),
                role             : node.role,
                tabIndex         : node.getAttribute?.('tabindex') ? node.tabIndex : null,
                tagName          : node.tagName?.toLowerCase?.()
            })
        }

        return path
    }

    /**
     * @summary Cancels pending outbound writes owned by a departing registration.
     * @param {String|null} id
     * @param {String} ownerKey
     * @param {String} [reason='unregistered']
     * @protected
     */
    cancelPendingForOwner(id, ownerKey, reason='unregistered') {
        for (const [requestId, pending] of [...this.#pendingWrites.entries()]) {
            if ((id === null || pending.id === id) && pending.ownerKeys.has(ownerKey)) {
                pending.ownerKeys.delete(ownerKey);

                if (pending.ownerKeys.size === 0) {
                    this.cancelWrite({reason, requestId})
                }
            }
        }
    }

    /**
     * @summary Aborts an in-flight outbound clipboard write so the browser preserves prior clipboard state.
     * @param {Object} [data={}]
     * @param {String} [data.reason='cancelled']
     * @param {String} data.requestId
     * @returns {Boolean}
     */
    cancelWrite(data={}) {
        const
            {reason = 'cancelled', requestId} = data,
            pending                           = requestId ? this.#pendingWrites.get(requestId) : null;

        if (!pending) {
            return false
        }

        this.#pendingWrites.delete(requestId);
        pending.timeoutId !== null && clearTimeout(pending.timeoutId);

        const error = this.createAbortError(reason);

        pending.resolvers.forEach(({reject}) => reject(error));

        return true
    }

    /**
     * @summary Creates the rejection reason used to abort pending `ClipboardItem` MIME promises.
     * @param {String} reason
     * @returns {Error}
     * @protected
     */
    createAbortError(reason) {
        return typeof DOMException === 'function'
            ? new DOMException(reason, 'AbortError')
            : new Error(reason)
    }

    /**
     * @summary Removes the native `copy`, `cut`, and `paste` listeners from a target group's DOM node.
     * @param {Object} group
     * @protected
     */
    detachTarget(group) {
        const {listeners, node} = group;

        if (node && listeners) {
            Object.entries(listeners).forEach(([type, fn]) => {
                node.removeEventListener?.(type, fn)
            })
        }
    }

    /**
     * @summary Cancels all pending writes, invalidates retry tokens, and removes all DOM listeners.
     * @param {...*} args
     */
    destroy(...args) {
        this.#registrationTokens.clear();

        for (const requestId of [...this.#pendingWrites.keys()]) {
            this.cancelWrite({reason: 'destroyed', requestId})
        }

        this.#targets.forEach(group => this.detachTarget(group));
        this.#targets.clear();

        super.destroy(...args)
    }

    /**
     * @summary Resolves an in-flight outbound clipboard write with text or multi-MIME payloads from the App Worker.
     * @param {Object} [data={}]
     * @param {Object} [data.items] Map of MIME type to string or `Blob` payload
     * @param {String} data.requestId
     * @param {String} [data.text] Shorthand payload for `'text/plain'`
     * @returns {Boolean}
     */
    fulfillWrite(data={}) {
        const
            {items, requestId, text} = data,
            pending                  = requestId ? this.#pendingWrites.get(requestId) : null;

        if (!pending) {
            return false
        }

        this.#pendingWrites.delete(requestId);
        pending.timeoutId !== null && clearTimeout(pending.timeoutId);

        const
            hasItems = Boolean(items && typeof items === 'object' && Object.keys(items).length > 0),
            hasText  = text !== undefined && text !== null;

        if (!hasItems && !hasText) {
            const error = this.createAbortError('empty clipboard payload');

            pending.resolvers.forEach(({reject}) => reject(error));

            return false
        }

        for (const [type, {resolve}] of pending.resolvers.entries()) {
            const rawValue = hasItems && Object.hasOwn(items, type)
                ? items[type]
                : (type === 'text/plain' && hasText ? text : '');

            const blob = rawValue instanceof Blob
                ? rawValue
                : new Blob([String(rawValue ?? '')], {type});

            resolve(blob)
        }

        return true
    }

    /**
     * @summary Returns the registrations on `id` that accept `target` after editable-descendant filtering.
     * @param {String} id
     * @param {Element|Node|Object|null} target
     * @returns {Object[]}
     * @protected
     */
    getActiveRegistrations(id, target) {
        const group = this.#targets.get(id);

        if (!group || group.registrations.size === 0) {
            return []
        }

        let isEditable;

        return [...group.registrations.values()].filter(registration => {
            if (!registration.ignoreEditableTargets) {
                return true
            }

            isEditable ??= this.isEditableTarget(target);

            return !isEditable
        })
    }

    /**
     * @summary Determines whether an event target sits inside a native editable control (`<input>`, `<textarea>`, or `[contenteditable]`).
     * @param {Element|Node|Object|null} target
     * @returns {Boolean}
     * @protected
     */
    isEditableTarget(target) {
        const element = target?.nodeType === 3 ? (target.parentElement || target.parentNode) : target;

        if (!element) {
            return false
        }

        let contentEditableBlocked = false;

        for (let node = element; node; node = node.parentElement || node.parentNode) {
            if (node.nodeType && node.nodeType !== 1) {
                break
            }

            const tagName = node.tagName?.toLowerCase?.();

            if (tagName === 'textarea') {
                return !node.disabled
            }

            if (tagName === 'input') {
                if (node.disabled) {
                    return false
                }

                const inputType = String(node.type || node.getAttribute?.('type') || 'text').toLowerCase();

                return !NON_TEXT_INPUT_TYPES.has(inputType)
            }

            if (!contentEditableBlocked) {
                const rawEditable = node.getAttribute?.('contenteditable')
                    ?? (typeof node.contentEditable === 'string' && node.contentEditable !== 'inherit' ? node.contentEditable : null);

                if (typeof rawEditable === 'string') {
                    const normalized = rawEditable.trim().toLowerCase();

                    if (normalized === 'false') {
                        contentEditableBlocked = true
                    } else if (normalized === '' || normalized === 'true' || normalized === 'plaintext-only') {
                        return true
                    }
                } else if (node.isContentEditable === true) {
                    return true
                }
            }
        }

        if (!contentEditableBlocked && !element.parentElement && !element.parentNode) {
            const editableAncestor = element.closest?.('[contenteditable]');

            if (editableAncestor) {
                const attr = String(editableAncestor.getAttribute?.('contenteditable') ?? editableAncestor.contentEditable ?? '').trim().toLowerCase();

                return attr === '' || attr === 'true' || attr === 'plaintext-only'
            }
        }

        return false
    }

    /**
     * @summary Deduplicates a MIME type list and guarantees at least `'text/plain'`.
     * @param {String[]} [mimeTypes]
     * @returns {String[]}
     * @protected
     */
    normalizeMimeTypes(mimeTypes) {
        const list = Array.isArray(mimeTypes)
            ? [...new Set(mimeTypes.filter(type => typeof type === 'string' && type.trim() !== ''))]
            : [];

        return list.length > 0 ? list : ['text/plain']
    }

    /**
     * @summary Handles native `copy` and `cut` gestures by binding a pending `ClipboardItem` synchronously and notifying the App Worker.
     * @param {String} id
     * @param {ClipboardEvent|Event} event
     * @protected
     */
    onCopyOrCut(id, event) {
        const
            target              = event?.target?.nodeType === 3 ? (event.target.parentElement || event.target.parentNode) : event?.target,
            activeRegistrations = this.getActiveRegistrations(id, target);

        if (activeRegistrations.length === 0) {
            return
        }

        const
            clipboard         = globalThis.navigator?.clipboard,
            ClipboardItemCtor = globalThis.ClipboardItem;

        if (typeof clipboard?.write !== 'function' || typeof ClipboardItemCtor !== 'function') {
            return
        }

        event.preventDefault();

        const
            me               = this,
            primary          = activeRegistrations.at(-1),
            mimeTypes        = [...new Set(activeRegistrations.flatMap(reg => reg.mimeTypes))],
            pendingTimeoutMs = Math.max(...activeRegistrations.map(reg => reg.pendingTimeoutMs)),
            requestId        = `clipboard-req-${++me.#requestSequence}`,
            itemMap          = {},
            resolvers        = new Map();

        for (const type of mimeTypes) {
            let rejectMime, resolveMime;

            const promise = new Promise((resolve, reject) => {
                resolveMime = resolve;
                rejectMime  = reject
            });

            promise.catch(Neo.emptyFn);

            resolvers.set(type, {reject: rejectMime, resolve: resolveMime});
            itemMap[type] = promise
        }

        try {
            const writePromise = clipboard.write([new ClipboardItemCtor(itemMap)]);
            writePromise?.catch?.(Neo.emptyFn)
        } catch {
            return
        }

        const timeoutId = pendingTimeoutMs > 0
            ? setTimeout(() => {
                me.cancelWrite({reason: 'timeout', requestId})
            }, pendingTimeoutMs)
            : null;

        me.#pendingWrites.set(requestId, {
            componentId: primary.componentId,
            id,
            mimeTypes,
            ownerKeys  : new Set(activeRegistrations.map(reg => reg.ownerKey)),
            resolvers,
            timeoutId
        });

        Neo.worker.Manager.sendMessage('app', {
            action   : 'domEvent',
            eventName: event.type,
            data     : {
                componentId: primary.componentId,
                id,
                mimeTypes,
                path       : me.buildEventPath(target, event.type),
                requestId
            }
        })
    }

    /**
     * @summary Handles native `paste` gestures by reading `event.clipboardData` synchronously and forwarding the payload to the App Worker.
     * @param {String} id
     * @param {ClipboardEvent|Event} event
     * @protected
     */
    onPaste(id, event) {
        const
            target              = event?.target?.nodeType === 3 ? (event.target.parentElement || event.target.parentNode) : event?.target,
            activeRegistrations = this.getActiveRegistrations(id, target);

        if (activeRegistrations.length === 0) {
            return
        }

        event.preventDefault();

        const
            primary       = activeRegistrations.at(-1),
            mimeTypes     = [...new Set(activeRegistrations.flatMap(reg => reg.mimeTypes))],
            clipboardData = event.clipboardData,
            items         = {};

        let text = '';

        if (clipboardData && typeof clipboardData.getData === 'function') {
            mimeTypes.forEach(type => {
                items[type] = clipboardData.getData(type) ?? ''
            });

            text = Object.hasOwn(items, 'text/plain')
                ? items['text/plain']
                : (clipboardData.getData('text/plain') ?? '');

            if (text !== '' && !Object.hasOwn(items, 'text/plain')) {
                items['text/plain'] = text
            }
        }

        Neo.worker.Manager.sendMessage('app', {
            action   : 'domEvent',
            eventName: 'paste',
            data     : {
                componentId: primary.componentId,
                id,
                items,
                path       : this.buildEventPath(target, 'paste'),
                text
            }
        })
    }

    /**
     * @summary Registers a DOM subtree for `copy`, `cut`, and `paste` bridging to the App Worker.
     * @param {Object} [data={}]
     * @param {String} [data.componentId] Owning component id
     * @param {String} [data.id] Target DOM node id (defaults to `componentId`)
     * @param {Boolean} [data.ignoreEditableTargets=true] When true, native editable descendants bypass the addon
     * @param {String[]} [data.mimeTypes=['text/plain']] MIME types declared for outbound `ClipboardItem` and inbound `paste`
     * @param {Number} [data.pendingTimeoutMs] Timeout in ms for unfulfilled outbound writes
     * @param {Number} [count=0] Current retry attempt counter
     * @returns {Promise<Boolean>}
     */
    async register(data={}, count=0) {
        const
            me            = this,
            {componentId} = data,
            id            = data.id || componentId;

        if (!id || me.isDestroyed) {
            return false
        }

        const
            ownerKey = componentId || id,
            tokenKey = `${id}::${ownerKey}`,
            token    = ++me.#tokenSequence;

        me.#registrationTokens.set(tokenKey, token);

        let node = me.resolveElement(id);

        while (!node && count < me.registerAttempts) {
            await me.timeout(100);

            if (me.isDestroyed || me.#registrationTokens.get(tokenKey) !== token) {
                return false
            }

            count++;
            node = me.resolveElement(id)
        }

        if (!node || me.isDestroyed || me.#registrationTokens.get(tokenKey) !== token) {
            return false
        }

        let group = me.#targets.get(id);

        if (group && group.node !== node) {
            me.detachTarget(group);
            group = null
        }

        if (!group) {
            const listeners = {
                copy : event => me.onCopyOrCut(id, event),
                cut  : event => me.onCopyOrCut(id, event),
                paste: event => me.onPaste(id, event)
            };

            Object.entries(listeners).forEach(([type, fn]) => {
                node.addEventListener?.(type, fn)
            });

            group = {
                id,
                listeners,
                node,
                registrations: new Map()
            };

            me.#targets.set(id, group)
        }

        group.registrations.set(ownerKey, {
            componentId          : componentId || id,
            id,
            ignoreEditableTargets: data.ignoreEditableTargets !== false,
            mimeTypes            : me.normalizeMimeTypes(data.mimeTypes),
            ownerKey,
            pendingTimeoutMs     : Neo.isNumber(data.pendingTimeoutMs) ? data.pendingTimeoutMs : me.defaultPendingTimeoutMs
        });

        return true
    }

    /**
     * @summary Resolves a DOM element through the dual-identity `DomAccess` authority (`id` or `data-neo-id`).
     * @param {String} id
     * @returns {HTMLElement|Object|null}
     * @protected
     */
    resolveElement(id) {
        return Neo.main?.DomAccess?.getElement?.(id) ?? null
    }

    /**
     * @summary Retires a clipboard registration, detaches DOM listeners once empty, and aborts pending writes.
     * @param {Object} [data={}]
     * @param {String} [data.componentId]
     * @param {String} [data.id]
     * @returns {Boolean}
     */
    unregister(data={}) {
        const
            me                = this,
            {componentId, id} = data;

        if (!id && componentId === undefined) {
            return false
        }

        let changed = false;

        if (id) {
            const
                ownerKey = componentId || id,
                tokenKey = `${id}::${ownerKey}`;

            if (me.#registrationTokens.delete(tokenKey)) {
                changed = true
            }

            me.cancelPendingForOwner(id, ownerKey);

            const group = me.#targets.get(id);

            if (group?.registrations.delete(ownerKey)) {
                changed = true;

                if (group.registrations.size === 0) {
                    me.detachTarget(group);
                    me.#targets.delete(id)
                }
            }

            return changed
        }

        const suffix = `::${componentId}`;

        for (const tokenKey of [...me.#registrationTokens.keys()]) {
            if (tokenKey.endsWith(suffix)) {
                me.#registrationTokens.delete(tokenKey);
                changed = true
            }
        }

        me.cancelPendingForOwner(null, componentId);

        for (const [targetId, group] of [...me.#targets.entries()]) {
            if (group.registrations.delete(componentId)) {
                changed = true;

                if (group.registrations.size === 0) {
                    me.detachTarget(group);
                    me.#targets.delete(targetId)
                }
            }
        }

        return changed
    }
}

export default Neo.setupClass(Clipboard);
