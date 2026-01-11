import Canvas from '../../../../../src/component/Canvas.mjs';

/**
 * @class AgentOS.view.TimelineCanvas
 * @extends Neo.component.Canvas
 */
class TimelineCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='AgentOS.view.TimelineCanvas'
         * @protected
         */
        className: 'AgentOS.view.TimelineCanvas',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'div', cls: ['neo-ticket-timeline-wrapper'], style: {width: '100%', height: '100%'}, cn: [
            {tag: 'canvas', style: {width: '100%', height: '100%'}}
        ]}
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
            await Portal.canvas.TicketCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

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

    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.waitForDomRect({id: me.getCanvasId()})
        }

        // todo
        await Portal.canvas.TicketCanvas.updateSize({width: rect.width, height: rect.height})
    }
}

export default Neo.setupClass(TimelineCanvas);
