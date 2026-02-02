import Canvas from '../../../src/component/Canvas.mjs';

/**
 * @summary The App Worker component for the DevRank "Living Sparklines".
 *
 * This component acts as the **Controller** and **Bridge** for the sparkline visualization.
 * It does not perform any rendering itself. Instead, it delegates all visual logic to
 * `DevRank.canvas.Sparkline` (SharedWorker), ensuring the main thread remains responsive.
 *
 * **Responsibilities:**
 * 1.  **Lifecycle Management:** Registers the canvas with the SharedWorker when it becomes available.
 * 2.  **State Synchronization:** Pushes data changes (`values`, `usePulse`, `theme`) to the worker.
 * 3.  **Input Bridging:** Captures mouse events (move, leave) and forwards normalized coordinates
 *     to the worker for the interactive "Scanner" effect.
 *
 * @class DevRank.view.SparklineComponent
 * @extends Neo.component.Canvas
 * @see DevRank.canvas.Sparkline
 */
class SparklineComponent extends Canvas {
    static config = {
        /**
         * @member {String} className='DevRank.view.SparklineComponent'
         * @protected
         */
        className: 'DevRank.view.SparklineComponent',
        /**
         * @member {String[]} cls=['devrank-sparkline-canvas']
         */
        cls: ['devrank-sparkline-canvas'],
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
         * Controls the "Living Pulse" animation.
         * Set to `false` to disable the background animation (e.g., for power saving).
         * @member {Boolean} usePulse_=true
         */
        usePulse_: true,
        /**
         * @member {Number[]|null} values_=null
         */
        values_: null,
        /**
         * @member {String[]} wrapperCls=['devrank-sparkline-wrapper']
         */
        wrapperCls: ['devrank-sparkline-wrapper'],
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
            this.renderer.updateConfig({
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
            me.renderer.updateData({
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

            await me.renderer.register({
                canvasId        : me.id,
                devicePixelRatio: Neo.config.devicePixelRatio,
                theme           : me.theme || 'light',
                usePulse        : me.usePulse,
                windowId        : me.windowId
            });

            if (values) {
                me.renderer.updateData({
                    canvasId: me.id,
                    values
                })
            }
            
            // Initial size sync
            let rect = await me.getDomRect(me.id);
            if (rect) {
                me.renderer.updateSize({
                    canvasId: me.id,
                    devicePixelRatio: Neo.config.devicePixelRatio,
                    height  : rect.height,
                    width   : rect.width
                })
            }
        }
    }

    /**
     * @returns {Object}
     */
    get renderer() {
        return Neo.ns('DevRank.canvas.Sparkline')
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

        // Ensure Canvas Worker is running
        await Neo.worker.Manager.startWorker({name: 'canvas'});

        // Wait for the Canvas Worker remote to be available.
        // The startWorker call returns when the Main thread has created the worker,
        // but the worker needs to boot and register its remotes (including loadModule).
        let i = 0;

        while (!Neo.ns('Neo.worker.Canvas.loadModule') && i < 40) {
            await this.timeout(50);
            i++
        }

        if (Neo.ns('Neo.worker.Canvas.loadModule')) {
            // Load the specific renderer module for this component
            await Neo.worker.Canvas.loadModule({
                path: 'apps/devrank/canvas/Sparkline.mjs'
            })
        } else {
            console.error('SparklineComponent: Canvas Worker failed to register remote methods.')
        }
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.renderer.onMouseLeave({
            canvasId: this.id
        })
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        this.renderer.onMouseMove({
            canvasId: this.id,
            x       : data.offsetX,
            y       : data.offsetY
        })
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        this.renderer.updateSize({
            canvasId        : this.id,
            devicePixelRatio: Neo.config.devicePixelRatio,
            height          : data.contentRect.height,
            width           : data.contentRect.width
        })
    }
}

export default Neo.setupClass(SparklineComponent);
