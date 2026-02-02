import Canvas from './Canvas.mjs';

/**
 * @class Neo.component.Sparkline
 * @extends Neo.component.Canvas
 */
class Sparkline extends Canvas {
    static config = {
        /**
         * @member {String} className='Neo.component.Sparkline'
         * @protected
         */
        className: 'Neo.component.Sparkline',
        /**
         * @member {String[]} cls=['neo-sparkline-canvas']
         */
        cls: ['neo-sparkline-canvas'],
        /**
         * @member {Object[]} domListeners
         */
        domListeners: [{
            mousemove : {fn: 'onMouseMove', local: true},
            mouseleave: 'onMouseLeave'
        }],
        /**
         * @member {Object} listeners
         */
        listeners: {
            resize: 'onResize'
        },
        /**
         * @member {String} ntype='sparkline'
         * @protected
         */
        ntype: 'sparkline',
        /**
         * The class name of the renderer to use in the worker.
         * @member {String|null} rendererClassName=null
         */
        rendererClassName: null,
        /**
         * The import path for the renderer module.
         * @member {String|null} rendererImportPath=null
         */
        rendererImportPath: null,
        /**
         * Controls the "Living Pulse" animation.
         * Set to `false` to disable the background animation.
         * @member {Boolean} usePulse_=true
         */
        usePulse_: true,
        /**
         * @member {Number[]|null} values_=null
         */
        values_: null,
        /**
         * @member {String[]} wrapperCls=['neo-sparkline-wrapper']
         */
        wrapperCls: ['neo-sparkline-wrapper'],
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                tag: 'canvas'
            }]
        }
    }

    /**
     * Updates the pulse configuration in the worker when `usePulse` changes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetUsePulse(value, oldValue) {
        if (this.offscreenRegistered && value !== undefined) {
            this.renderer?.updateConfig({
                canvasId: this.id,
                usePulse: value
            })
        }
    }

    /**
     * @param {Number[]|null} value
     * @param {Number[]|null} oldValue
     */
    afterSetValues(value, oldValue) {
        let me = this;

        if (me.offscreenRegistered && value) {
            me.renderer?.updateData({
                canvasId: me.id,
                values  : value
            })
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetMounted(value, oldValue) {
        if (value) {
            await this.ready()
        }

        super.afterSetMounted(value, oldValue)
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        if (value) {
            let me       = this,
                {values} = me;

            await me.renderer?.register({
                canvasId        : me.id,
                devicePixelRatio: Neo.config.devicePixelRatio,
                theme           : me.theme || 'light',
                usePulse        : me.usePulse,
                windowId        : me.windowId
            });

            if (values) {
                me.renderer?.updateData({
                    canvasId: me.id,
                    values
                })
            }

            // Initial size sync
            let rect = await me.getDomRect(me.id);
            if (rect) {
                me.renderer?.updateSize({
                    canvasId: me.id,
                    devicePixelRatio: Neo.config.devicePixelRatio,
                    height  : rect.height,
                    width   : rect.width
                })
            }
        }
    }

    /**
     * @returns {Object|null}
     */
    get renderer() {
        return this.rendererClassName ? Neo.ns(this.rendererClassName) : null
    }

    /**
     * @returns {Object}
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @returns {Object}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.rendererImportPath) {
             // Ensure Canvas Worker is running
            await Neo.worker.Manager.startWorker({name: 'canvas'});

            // Wait for the Canvas Worker remote to be available.
            let i = 0;

            while (!Neo.ns('Neo.worker.Canvas.loadModule') && i < 40) {
                await this.timeout(50);
                i++
            }

            if (Neo.ns('Neo.worker.Canvas.loadModule')) {
                // Load the specific renderer module for this component
                await Neo.worker.Canvas.loadModule({
                    path: this.rendererImportPath
                })
            } else {
                console.error('Neo.component.Sparkline: Canvas Worker failed to register remote methods.')
            }
        }
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.renderer?.onMouseLeave({
            canvasId: this.id
        })
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        this.renderer?.onMouseMove({
            canvasId: this.id,
            x       : data.offsetX,
            y       : data.offsetY
        })
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        this.renderer?.updateSize({
            canvasId        : this.id,
            devicePixelRatio: Neo.config.devicePixelRatio,
            height          : data.contentRect.height,
            width           : data.contentRect.width
        })
    }
}

export default Neo.setupClass(Sparkline);
