import Component from './Base.mjs';

/**
 * @class Neo.component.Canvas
 * @extends Neo.component.Base
 */
class Canvas extends Component {
    static getConfig() {return {
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
    }}

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me     = this,
            id     = me.id,
            worker = Neo.currentWorker;

        if (value && me.offscreen) {
            worker.promiseMessage('main', {
                action: 'getOffscreenCanvas',
                nodeId: id
            }).then(data => {
                worker.promiseMessage('canvas', {
                    action: 'registerCanvas',
                    node  : data.offscreen,
                    nodeId: id
                }, [data.offscreen]).then(() => {
                    me.offscreenRegistered = true;
                });
            });
        }
    }
}

Neo.applyClassConfig(Canvas);

export {Canvas as default};
