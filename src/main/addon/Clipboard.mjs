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
     * Native `Event` instances already claimed during a gesture so nested roots and local `DomEvents` listeners never double-fire.
     * @member {WeakSet<Object>} #handledEvents=new WeakSet()
     * @private
     */
    #handledEvents = new WeakSet()
    /**
     * Reverse index from registered DOM nodes to their target groups for innermost-first ancestor matching.
     * @member {WeakMap<Object, Object>} #nodes=new WeakMap()
     * @private
     */
    #nodes = new WeakMap()
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
     * @param {Element|Node|Object} target
     * @returns {Object[]}
     * @protected
     */
    buildEventPath(target) {
        const element = target.nodeType === 3 ? target.parentNode : target;

        return Neo.main.DomEvents.getPathFromElement(element).map(
            node => Neo.main.DomEvents.getTargetData(node)
        )
    }

    /**
     * @summary Cancels pending outbound writes once their last active registration owner unregisters.
     * @param {String|null} id
     * @param {String} ownerKey
     * @param {String} [reason='unregistered']
     * @protected
     */
    cancelPendingForOwner(id, ownerKey, reason='unregistered') {
        const suffix = `::${ownerKey}`;

        for (const [requestId, pending] of [...this.#pendingWrites.entries()]) {
            for (const tokenKey of [...pending.ownerTokens]) {
                if (id ? tokenKey === `${id}::${ownerKey}` : tokenKey.endsWith(suffix)) {
                    pending.ownerTokens.delete(tokenKey)
                }
            }

            if (pending.ownerTokens.size === 0) {
                this.cancelWrite({reason, requestId})
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

        if (pending.timeoutId !== null) {
            clearTimeout(pending.timeoutId)
        }

        const error = this.createAbortError(reason);

        pending.resolvers.forEach(({reject}) => reject(error));

        return true
    }

    /**
     * @summary Reports whether this addon owns a native `copy`, `cut`, or `paste` event so local `DomEvents` listeners do not double-fire.
     * @param {ClipboardEvent|Event|Object|null} event
     * @returns {Boolean}
     */
    claimsEvent(event) {
        if (!event || (event.type !== 'copy' && event.type !== 'cut' && event.type !== 'paste')) {
            return false
        }

        if (this.#handledEvents.has(event)) {
            return true
        }

        if (
            event.type !== 'paste' && (
                typeof globalThis.navigator?.clipboard?.write !== 'function' ||
                typeof globalThis.ClipboardItem !== 'function'
            )
        ) {
            return false
        }

        if (event.currentTarget && this.#nodes.has(event.currentTarget)) {
            return true
        }

        return this.getMatchingRegistrations(event.target).length > 0
    }

    /**
     * @summary Creates the `AbortError` rejection reason used to abort pending `ClipboardItem` MIME promises.
     * @param {String} reason
     * @returns {DOMException}
     * @protected
     */
    createAbortError(reason) {
        return new DOMException(reason, 'AbortError')
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
     * @summary Removes the native capture-phase `copy`, `cut`, and `paste` listeners from a target group's DOM node.
     * @param {Object} group
     * @protected
     */
    detachTarget(group) {
        const {listeners, node} = group;

        this.#nodes.delete(node);

        Object.entries(listeners).forEach(([type, fn]) => {
            node.removeEventListener(type, fn, {capture: true})
        })
    }

    /**
     * @summary Resolves an in-flight outbound clipboard write and reports whether the browser committed every declared MIME representation.
     *
     * Every MIME type declared for the gesture must be supplied by the App Worker (`data.items[type]` neither
     * `undefined` nor `null`, or `data.text` for `'text/plain'`). If any declared MIME type is omitted, all
     * pending `ClipboardItem` promises are rejected so zero partial or empty representations are written and
     * prior clipboard contents stay intact. Once all declared `Blob` payloads resolve, this method awaits the
     * `navigator.clipboard.write()` promise opened during the user gesture and resolves to `true` only if the
     * browser accepted the write.
     *
     * @param {Object} [data={}]
     * @param {Object} [data.items] Map of declared MIME type to string or `Blob` payload
     * @param {String} data.requestId
     * @param {String} [data.text] Shorthand payload for `'text/plain'`
     * @returns {Promise<Boolean>}
     */
    async fulfillWrite(data={}) {
        const
            {items, requestId, text} = data,
            pending                  = requestId ? this.#pendingWrites.get(requestId) : null;

        if (!pending) {
            return false
        }

        this.#pendingWrites.delete(requestId);

        if (pending.timeoutId !== null) {
            clearTimeout(pending.timeoutId)
        }

        const
            hasItems = Boolean(items && typeof items === 'object'),
            hasText  = text !== undefined && text !== null,
            payloads = new Map();

        for (const type of pending.resolvers.keys()) {
            const rawValue = hasItems && Object.hasOwn(items, type) && items[type] !== undefined && items[type] !== null
                ? items[type]
                : (type === 'text/plain' && hasText ? text : undefined);

            if (rawValue === undefined) {
                const error = this.createAbortError(`Missing clipboard payload for ${type}`);

                pending.resolvers.forEach(({reject}) => reject(error));
                await pending.writeSettled;

                return false
            }

            payloads.set(
                type,
                rawValue instanceof Blob ? rawValue : new Blob([String(rawValue)], {type})
            )
        }

        for (const [type, {resolve}] of pending.resolvers.entries()) {
            resolve(payloads.get(type))
        }

        return await pending.writeSettled
    }

    /**
     * @summary Collects active registrations from innermost to outermost ancestor along `target`'s DOM path.
     * @param {Element|Node|Object|null} target
     * @returns {Object[]}
     * @protected
     */
    getMatchingRegistrations(target) {
        const element = target?.nodeType === 3 ? target.parentNode : target;

        if (!element || this.#targets.size === 0) {
            return []
        }

        const
            matches = [],
            path    = Neo.main.DomEvents.getPathFromElement(element);

        let isEditable;

        for (const node of path) {
            const group = this.#nodes.get(node);

            if (group) {
                for (const registration of [...group.registrations.values()].reverse()) {
                    if (!registration.ignoreEditableTargets) {
                        matches.push(registration)
                    } else {
                        isEditable ??= this.isEditableTarget(element);

                        if (!isEditable) {
                            matches.push(registration)
                        }
                    }
                }
            }
        }

        return matches
    }

    /**
     * @summary Determines whether an element sits inside an enabled native editable control (`<input>`, `<textarea>`, or `[contenteditable]`).
     * @param {Element|Object} element
     * @returns {Boolean}
     * @protected
     */
    isEditableTarget(element) {
        let contentEditableBlocked = false;

        for (let node = element; node; node = node.parentNode) {
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
     * @summary Handles native `copy` and `cut` gestures once per event by binding a pending `ClipboardItem` synchronously and notifying the App Worker.
     * @param {ClipboardEvent|Event} event
     * @protected
     */
    onCopyOrCut(event) {
        if (this.#handledEvents.has(event)) {
            return
        }

        const
            clipboard         = globalThis.navigator?.clipboard,
            ClipboardItemCtor = globalThis.ClipboardItem;

        if (typeof clipboard?.write !== 'function' || typeof ClipboardItemCtor !== 'function') {
            return
        }

        const activeRegistrations = this.getMatchingRegistrations(event.target);

        if (activeRegistrations.length === 0) {
            return
        }

        this.#handledEvents.add(event);
        event.preventDefault();

        const
            me                            = this,
            primary                       = activeRegistrations[0],
            {mimeTypes, pendingTimeoutMs} = primary,
            requestId                     = `clipboard-req-${++me.#requestSequence}`,
            itemMap                       = {},
            resolvers                     = new Map();

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

        let writeSettled;

        try {
            writeSettled = Promise.resolve(clipboard.write([new ClipboardItemCtor(itemMap)]))
                .then(() => true, () => false)
        } catch {
            writeSettled = Promise.resolve(false)
        }

        const timeoutId = pendingTimeoutMs > 0
            ? setTimeout(() => {
                me.cancelWrite({reason: 'timeout', requestId})
            }, pendingTimeoutMs)
            : null;

        me.#pendingWrites.set(requestId, {
            componentId: primary.componentId,
            id         : primary.id,
            mimeTypes,
            ownerTokens: new Set(activeRegistrations.map(reg => `${reg.id}::${reg.ownerKey}`)),
            resolvers,
            timeoutId,
            writeSettled
        });

        Neo.worker.Manager.sendMessage('app', {
            action   : 'domEvent',
            eventName: event.type,
            data     : {
                componentId: primary.componentId,
                id         : primary.id,
                mimeTypes,
                path       : me.buildEventPath(event.target),
                requestId
            }
        })
    }

    /**
     * @summary Handles native `paste` gestures once per event by reading `event.clipboardData` synchronously and forwarding the payload to the App Worker.
     * @param {ClipboardEvent|Event} event
     * @protected
     */
    onPaste(event) {
        if (this.#handledEvents.has(event)) {
            return
        }

        const activeRegistrations = this.getMatchingRegistrations(event.target);

        if (activeRegistrations.length === 0) {
            return
        }

        this.#handledEvents.add(event);
        event.preventDefault();

        const
            primary       = activeRegistrations[0],
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
                id         : primary.id,
                items,
                path       : this.buildEventPath(event.target),
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

        if (!node) {
            return false
        }

        let group = me.#targets.get(id);

        if (group && group.node !== node) {
            me.detachTarget(group);
            group = null
        }

        if (!group) {
            const listeners = {
                copy : event => me.onCopyOrCut(event),
                cut  : event => me.onCopyOrCut(event),
                paste: event => me.onPaste(event)
            };

            Object.entries(listeners).forEach(([type, fn]) => {
                node.addEventListener(type, fn, {capture: true})
            });

            group = {
                id,
                listeners,
                node,
                registrations: new Map()
            };

            me.#nodes.set(node, group);
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
        return Neo.main.DomAccess.getElement(id) ?? null
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
