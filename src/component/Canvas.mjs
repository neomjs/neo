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
         * @member {Boolean} offscreen=false
         */
        offscreen: false,
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
        let me = this;

        if (value && me.offscreen) {
            Neo.currentWorker.promiseMessage('main', {action: 'getOwnership', nodeId: me.id}).then(data => {
                console.log('then', data);
            })
        }
    }
}

Neo.applyClassConfig(Canvas);

export {Canvas as default};
