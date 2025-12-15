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

        let me          = this,
            id          = me.getCanvasId(),
            {offscreen} = me,
            worker      = Neo.currentWorker;

        await me.timeout(30); // next rAF tick

        if (value && offscreen) {
            const data = await worker.promiseMessage('main', {
                action  : 'getOffscreenCanvas',
                nodeId  : id,
                windowId: me.windowId
            });

            await worker.promiseMessage('canvas', {
                action: 'registerCanvas',
                node  : data.offscreen,
                nodeId: id
            }, [data.offscreen])

            me.offscreenRegistered = true
        } else if (offscreen) {
            me.offscreenRegistered = false
        }
    }


    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        if (oldValue) {
            this.offscreenRegistered = false
        }
    }

    /**
     * Override this method when using wrappers (e.g. D3)
     * @returns {String}
     */
    getCanvasId() {
        return this.id
    }
}

export default Neo.setupClass(Canvas);
