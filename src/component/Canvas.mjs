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

        let me                    = this,
            id                    = me.getCanvasId(),
            {offscreen, windowId} = me;

        if (value) {
            await me.timeout(30); // next rAF tick

            if (me.monitorSize) {
                me.addDomListeners([{
                    delegate: `#${me.getMonitorTargetId()}`,
                    resize  : me.onDomResize,
                    scope   : me
                }])
            }

            if (offscreen) {
                let data,
                    delay = 50;

                while (me.mounted && !me.offscreenRegistered && !me.isDestroyed) {
                    data = await Neo.main.DomAccess.getOffscreenCanvas({
                        nodeId: id,
                        windowId
                    });

                    if (data.offscreen) {
                        await Neo.worker.Canvas.registerCanvas({
                            node  : data.offscreen,
                            nodeId: id,
                            windowId
                        }, [data.offscreen]);

                        me.offscreenRegistered = true;
                        break
                    } else if (data.transferred) {
                        if (Neo.config.useSharedWorkers) {
                            let retrieveData = await Neo.worker.Canvas.retrieveCanvas({
                                nodeId: id,
                                windowId
                            });

                            if (retrieveData.hasCanvas) {
                                me.offscreenRegistered = true;
                                break
                            }
                        }
                    }

                    await me.timeout(delay);

                    if (delay < 1000) {
                        delay *= 2
                    }
                }
            }
        } else if (offscreen) {
            if (me.offscreenRegistered) {
                Neo.worker.Canvas.unregisterCanvas({
                    nodeId: id
                })
            }

            me.offscreenRegistered = false
        }
    }


    /**
     * Triggered after the windowId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (oldValue) {
            this.offscreenRegistered = false
        }
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        if (this.offscreenRegistered) {
            Neo.worker.Canvas.unregisterCanvas({
                nodeId: this.id
            })
        }

        super.destroy(...args)
    }

    /**
     * Override this method when using wrappers (e.g. D3)
     * @returns {String}
     */
    getCanvasId() {
        return this.id
    }

    /**
     * The DOM node ID that should trigger the canvas resize updates.
     * By default, this is the component's top-level wrapper ID.
     * Subclasses can override this to observe a different node (e.g. a parent container).
     * @returns {String}
     */
    getMonitorTargetId() {
        return this.vdom.id
    }

    /**
     * @param {Object} data
     */
    onDomResize(data) {
        this.fire('resize', data)
    }
}

export default Neo.setupClass(Canvas);
