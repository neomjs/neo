import Canvas from '../../../src/component/Canvas.mjs';

/**
 * @class AgentOS.view.Blackboard
 * @extends Neo.component.Canvas
 */
class Blackboard extends Canvas {
    static config = {
        /**
         * @member {String} className='AgentOS.view.Blackboard'
         * @protected
         */
        className: 'AgentOS.view.Blackboard',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'div', cls: ['neo-blackboard-wrapper'], style: {width: '100%', height: '100%'}, cn: [
            {tag: 'canvas', style: {width: '100%', height: '100%'}}
        ]}
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetId(value, oldValue) {
        let me = this;
        me.vdom.cn[0].id = `${value}__canvas`;
        super.afterSetId(value, oldValue)
    }

    /**
     * Triggered after the offscreenRegistered config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        if (value) {
            let me = this;

            // Direct Remote Method Access call
            // The namespace AgentOS.canvas.Blackboard is auto-generated in this worker
            // by the RemoteMethodAccess mixin when the Canvas worker registers it.
            await AgentOS.canvas.Blackboard.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            await me.updateSize()
        }
    }

    /**
     * Override to return the inner canvas ID
     */
    getCanvasId() {
        return this.vdom.cn[0].id;
    }

    /**
     * @param {Object} data
     */
    onDomResize(data) {
        super.onDomResize(data);
        this.updateSize(data.contentRect)
    }

    /**
     * Pass new graph data to the worker
     * @param {Object} data {nodes, links}
     */
    async setData(data) {
        await AgentOS.canvas.Blackboard.updateGraphData(data);
    }

    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.waitForDomRect({id: me.getCanvasId()})
        }

        await AgentOS.canvas.Blackboard.updateSize({width: rect.width, height: rect.height})
    }
}

export default Neo.setupClass(Blackboard);
