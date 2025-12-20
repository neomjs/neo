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
         * true applies a main.addon.ResizeObserver and fires a custom resize event
         * which other instances can subscribe to.
         * @member {Boolean} monitorSize_=true
         * @reactive
         */
        monitorSize_: true,
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
            {offscreen} = me;

        if (value) {
            await me.timeout(30); // next rAF tick

            if (me.monitorSize) {
                me.addDomListeners([{
                    delegate: `#${me.getCanvasId()}`,
                    resize  : me.onDomResize,
                    scope   : me
                }])
            }

            if (offscreen) {
                const data = await Neo.main.DomAccess.getOffscreenCanvas({
                    nodeId  : id,
                    windowId: me.windowId
                });

                if (data.offscreen) {
                    await Neo.worker.Canvas.registerCanvas({
                        node    : data.offscreen,
                        nodeId  : id,
                        windowId: me.windowId
                    }, [data.offscreen]);

                    me.offscreenRegistered = true
                } else if (data.transferred) {
                    if (Neo.config.useSharedWorkers) {
                        let retrieveData = await Neo.worker.Canvas.retrieveCanvas({
                            nodeId  : id,
                            windowId: me.windowId
                        });

                        if (retrieveData.hasCanvas) {
                            me.offscreenRegistered = true
                        }
                    }
                }
            }
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

    /**
     * @param {Object} data
     */
    onDomResize(data) {
        this.fire('resize', data)
    }
}

export default Neo.setupClass(Canvas);
