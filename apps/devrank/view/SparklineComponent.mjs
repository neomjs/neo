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
         * @member {String} ntype='sparkline'
         * @protected
         */
        ntype: 'sparkline',
        /**
         * @member {Number[]|null} values_=null
         */
        values_: null
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
                canvasId: me.id,
                windowId: me.windowId
            });

            if (values) {
                me.renderer.updateData({
                    canvasId: me.id,
                    values
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
}

export default Neo.setupClass(SparklineComponent);
