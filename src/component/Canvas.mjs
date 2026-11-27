import Component from './Base.mjs';

/**
 * @class Neo.component.Canvas
 * @extends Neo.component.Base
 */
class Canvas extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Canvas'
         * @protected
         */
        className: 'Neo.component.Canvas',
        /**
         * @member {String} ntype='canvas'
         * @protected
         */
        ntype: 'canvas',
        /**
         * `true` while this canvas's pixels show its current content. Only the subclass that draws knows that
         * moment, so only a subclass sets it. The root reflects it as `data-drawn`, because a cover capture or a
         * test can otherwise not tell drawn pixels from an empty canvas: a stable layout and a finished animation
         * prove neither.
         * @member {Boolean} drawn_=false
         * @reactive
         */
        drawn_: false,
        /**
         * true applies a main.addon.ResizeObserver and fires a custom resize event
         * which other instances can subscribe to.
         * @member {Boolean} monitorSize_=true
         * @reactive
         */
        monitorSize_: true,
        /**
         * @member {Boolean} offscreen=true
         */
        offscreen: true,
        /**
         * Only applicable if offscreen === true.
         * true once the ownership of the canvas node got transferred to worker.Canvas.
         * @member {Boolean} offscreenRegistered_=false
         * @reactive
         */
        offscreenRegistered_: false,
        /**
         * Maps a Neo theme onto the light/dark hint a renderer needs.
         *
         * A map rather than a substring test on the theme name, because the name does not carry the
         * answer: `neo-theme-cyberpunk` is dark — `--neo-global-background-color: #0d1117`, and its own
         * `--neo-color-scheme` says `dark` — and is named neither. Every theme declares that token,
         * but the main-thread reader for it is protected and absent from the app remote manifest, so
         * a component in the App Worker cannot ask, and a renderer registration needs the answer
         * synchronously. A config rather than a constant, so a consumer can extend it for a theme
         * Neo does not ship.
         * @member {Object} themeMap
         */
        themeMap: {
            'neo-theme-cyberpunk': 'dark',
            'neo-theme-dark'     : 'dark',
            'neo-theme-light'    : 'light',
            'neo-theme-neo-dark' : 'dark',
            'neo-theme-neo-light': 'light'
        },
        /**
         * @member {Object} _vdom={tag: 'canvas'}
         */
        _vdom:
        {tag: 'canvas'}
    }

    /**
     * Worker-lifetime counter ensuring transfer tokens stay unique even if a destroyed Canvas ID is recreated.
     * @member {Number} #nextTransferId=0
     * @private
     * @static
     */
    static #nextTransferId = 0
    /**
     * Transfer token of the currently confirmed offscreen surface, used to fence delayed `unregisterCanvas` calls.
     * @member {String|null} #activeTransferId=null
     * @private
     */
    #activeTransferId = null
    /**
     * Monotonic token invalidating in-flight offscreen transfer attempts across unmount, window move, or destroy.
     * @member {Number} #mountGeneration=0
     * @private
     */
    #mountGeneration = 0

    /**
     * @returns {String|null}
     */
    get activeTransferId() {
        return this.#activeTransferId
    }

    /**
     * @summary Lets a worker-backed subclass refuse transfer while retaining the ordinary component mount lifecycle.
     * @returns {Boolean}
     * @protected
     */
    get canTransferOffscreenCanvas() {
        return true
    }

    /**
     * @summary Settles any parked transfer callback as cancelled so a superseded mount attempt cannot hang.
     * @param {String} [id=this.getCanvasId()]
     * @private
     */
    #cancelPendingRegistration(id=this.getCanvasId()) {
        const callback = this.registerCanvasCallbacks?.[id];

        if (callback) {
            delete this.registerCanvasCallbacks[id];
            callback(false)
        }
    }

    /**
     * @summary Transfers the mounted `<canvas>` element in `this.windowId` to the Canvas Worker, retrying briefly if
     * the destination window's DOM delta has not landed yet.
     * @param {String} id
     * @param {Number} generation
     * @returns {Promise<void>}
     * @private
     */
    async #transferOffscreenCanvas(id, generation) {
        let me = this;

        me.registerCanvasCallbacks ??= {};

        for (let attempt = 0; attempt < 60; attempt++) {
            if (me.isDestroyed || !me.mounted || generation !== me.#mountGeneration) {
                return
            }

            let {windowId} = me,
                transferId = `${me.id}:${++Canvas.#nextTransferId}`,
                callback, outcome, promise;

            promise = new Promise(resolve => {
                callback = confirmed => {
                    if (me.registerCanvasCallbacks?.[id] === callback) {
                        delete me.registerCanvasCallbacks[id]
                    }

                    resolve(confirmed !== false)
                };
                callback.transferId            = transferId;
                me.registerCanvasCallbacks[id] = callback
            });

            try {
                outcome = await Neo.main.DomAccess.transferCanvasToWorker({
                    componentId: me.id,
                    nodeId     : id,
                    transferId,
                    windowId
                })
            } catch {
                me.#cancelPendingRegistration(id);
                return
            }

            if (outcome?.transferred === false) {
                me.#cancelPendingRegistration(id);

                if (outcome.reason === 'missing-node') {
                    await me.timeout(30);
                    continue
                }

                return
            }

            if (await promise && !me.isDestroyed && me.mounted && generation === me.#mountGeneration && me.windowId === windowId) {
                me.#activeTransferId   = transferId;
                me.offscreenRegistered = true
            }

            return
        }
    }

    /**
     * Triggered after the drawn config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDrawn(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.vdom['data-drawn'] = value ? 'true' : null;
            me.update()
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me          = this,
            generation  = ++me.#mountGeneration,
            id          = me.getCanvasId(),
            {offscreen} = me;

        me.#cancelPendingRegistration(id);

        if (value) {
            if (offscreen && !me.canTransferOffscreenCanvas) return;

            await me.timeout(30); // next rAF tick

            if (me.isDestroyed || !me.mounted || generation !== me.#mountGeneration) {
                return
            }

            if (me.monitorSize) {
                me.addDomListeners([{
                    delegate: `#${me.getMonitorTargetId()}`,
                    resize  : me.onDomResize,
                    scope   : me
                }])
            }

            if (offscreen && me.canTransferOffscreenCanvas) {
                await me.#transferOffscreenCanvas(id, generation)
            }
        } else {
            // an unmounted canvas shows nothing
            me.drawn = false;

            if (offscreen) {
                let transferId = me.#activeTransferId;
                me.#activeTransferId = null;

                if (me.offscreenRegistered) {
                    Neo.worker.Canvas.unregisterCanvas({
                        nodeId  : id,
                        ...(transferId ? {transferId} : {}),
                        windowId: me.windowId
                    })
                }

                me.offscreenRegistered = false
            }
        }
    }


    /**
     * @summary Releases any prior window's offscreen registration when `windowId` moves to a new window, and schedules
     * re-registration when a cross-window container move left the descendant mounted.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let me         = this,
            generation = ++me.#mountGeneration,
            id         = me.getCanvasId();

        me.#cancelPendingRegistration(id);

        if (oldValue) {
            let transferId = me.#activeTransferId;
            me.#activeTransferId = null;

            if (me.offscreen && me.offscreenRegistered) {
                Neo.worker.Canvas.unregisterCanvas({
                    nodeId  : id,
                    ...(transferId ? {transferId} : {}),
                    windowId: oldValue
                })
            }

            me.drawn               = false;
            me.offscreenRegistered = false
        }

        if (value && oldValue && value !== oldValue && me.mounted && me.offscreen && me.canTransferOffscreenCanvas) {
            me.timeout(30).then(() => {
                if (!me.isDestroyed && me.mounted && generation === me.#mountGeneration && me.windowId === value) {
                    return me.#transferOffscreenCanvas(id, generation)
                }
            })
        }
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        let me         = this,
            id         = me.getCanvasId(),
            transferId = me.#activeTransferId;

        me.#activeTransferId = null;
        me.#mountGeneration++;
        me.#cancelPendingRegistration(id);

        if (me.offscreenRegistered) {
            Neo.worker.Canvas.unregisterCanvas({
                nodeId  : id,
                ...(transferId ? {transferId} : {}),
                windowId: me.windowId
            })
        }

        super.destroy(...args)
    }

    /**
     * Override this method when using wrappers (e.g. D3)
     * @returns {String}
     */
    getCanvasId() {
        return this.id
    }

    /**
     * The DOM node ID that should trigger the canvas resize updates.
     * By default, this is the component's top-level wrapper ID.
     * Subclasses can override this to observe a different node (e.g. a parent container).
     * @returns {String}
     */
    getMonitorTargetId() {
        return this.vdom.id
    }

    /**
     * @param {Object} data
     */
    onDomResize(data) {
        this.fire('resize', data)
    }

    /**
     * @summary Maps the theme this canvas actually renders under onto a light/dark hint.
     *
     * Resolution goes through {@link Neo.component.Base#getTheme}, never the `theme` config. A child
     * inside a themed scope carries no theme class of its own by design, so that config is `null` for
     * precisely the components which inherit a theme — and `container.Base#afterSetTheme` only stamps
     * live items on a CHANGE, leaving construction to `createItem`. Reading the config therefore
     * answers `null` on first render and the right value only after a theme toggle, which paints a
     * light canvas in a dark app until someone touches the theme switcher. `getTheme()` answers the
     * component's own theme first, so a canvas declaring one is not overruled by the scope it sits in.
     *
     * Pure and synchronous, so a renderer registration can carry the answer rather than correct it
     * afterwards, and an unmapped theme yields `'light'` — adding a theme cannot silently repaint an
     * existing app.
     * @returns {'dark'|'light'}
     * @protected
     */
    resolveColorScheme() {
        return this.themeMap[this.getTheme()] ?? 'light'
    }
}

export default Neo.setupClass(Canvas);
