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
         * answer: `neo-theme-cyberpunk` is dark — `--neo-background-color: #0d1117`, and its own
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
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me                    = this,
            id                    = me.getCanvasId(),
            {offscreen, windowId} = me;

        if (value) {
            await me.timeout(30); // next rAF tick

            if (me.monitorSize) {
                me.addDomListeners([{
                    delegate: `#${me.getMonitorTargetId()}`,
                    resize  : me.onDomResize,
                    scope   : me
                }])
            }

            if (offscreen) {
                me.registerCanvasCallbacks ??= {};

                let promise = new Promise(resolve => {
                    me.registerCanvasCallbacks[id] = resolve;
                });

                Neo.main.DomAccess.transferCanvasToWorker({
                    componentId: me.id,
                    nodeId     : id,
                    windowId
                });

                await promise;
                me.offscreenRegistered = true;
            }
        } else if (offscreen) {
            if (me.offscreenRegistered) {
                Neo.worker.Canvas.unregisterCanvas({
                    nodeId: id
                })
            }

            me.offscreenRegistered = false
        }
    }


    /**
     * Triggered after the windowId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (oldValue) {
            this.offscreenRegistered = false
        }
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        if (this.offscreenRegistered) {
            Neo.worker.Canvas.unregisterCanvas({
                nodeId: this.id
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
