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
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me          = this,
            id          = me.getCanvasId(),
            {offscreen} = me,
            worker      = Neo.currentWorker;

        if (value && offscreen) {
            worker.promiseMessage('main', {
                action : 'getOffscreenCanvas',
                appName: me.appName,
                nodeId : id
            }).then(data => {
                worker.promiseMessage('canvas', {
                    action: 'registerCanvas',
                    node  : data.offscreen,
                    nodeId: id
                }, [data.offscreen]).then(() => {
                    me.offscreenRegistered = true
                })
            })
        } else if (offscreen) {
            me.offscreenRegistered = false
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

Neo.setupClass(Canvas);

export default Canvas;
