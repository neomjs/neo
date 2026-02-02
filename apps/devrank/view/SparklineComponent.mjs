import Canvas from '../../../src/component/Canvas.mjs';

/**
 * @class DevRank.view.SparklineComponent
 * @extends Neo.component.Canvas
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
