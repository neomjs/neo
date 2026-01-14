import Canvas from '../../../src/component/Canvas.mjs';

/**
 * @summary Canvas overlay for the HeaderToolbar.
 * @class Portal.view.HeaderCanvas
 * @extends Neo.component.Canvas
 */
class HeaderCanvas extends Canvas {
    static config = {
        /**
         * @member {String} className='Portal.view.HeaderCanvas'
         * @protected
         */
        className: 'Portal.view.HeaderCanvas',
        /**
         * @member {Object} listeners
         */
        listeners: {
            resize: 'onResize'
        },
        /**
         * @member {Object} style
         */
        style: {
            height       : '100%',
            left         : '0',
            pointerEvents: 'none',
            position     : 'absolute',
            top          : '0',
            width        : '100%',
            zIndex       : 1 // Ensure it is above the background but below/above items as needed?
                             // If it's an overlay for effects *on* items, it might need to be on top.
                             // But buttons need to be clickable. pointerEvents: 'none' handles clicks.
        },
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'canvas'}
    }

    /**
     * @member {String|null} canvasId=null
     */
    canvasId = null
    /**
     * @member {Boolean} isCanvasReady=false
     */
    isCanvasReady = false
    /**
     * @member {Object[]} navRects=null
     */
    navRects = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        let me = this;

        if (value) {
            await Portal.canvas.Helper.importHeaderCanvas();
            await Portal.canvas.HeaderCanvas.initGraph({canvasId: me.getCanvasId(), windowId: me.windowId});

            me.isCanvasReady = true;

            Neo.main.addon.ResizeObserver.register({
                id      : me.id,
                windowId: me.windowId
            });

            // Listen to mouse events on the parent Toolbar
            me.addDomListeners([{
                click     : {fn: me.onClick, local: true},
                mouseleave: me.onMouseLeave,
                mousemove : {fn: me.onMouseMove, local: true},
                scope     : me,
                vnodeId   : me.parentId
            }]);

            await me.updateSize();
            await me.updateNavRects()
        } else if (oldValue) {
            me.isCanvasReady = false;
            await Portal.canvas.HeaderCanvas.clearGraph()
        }
    }

    /**
     * @returns {String}
     */
    getCanvasId() {
        let me = this;

        if (!me.canvasId) {
            me.canvasId = me.id
        }

        return me.canvasId
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        if (me.isCanvasReady && me.canvasRect) {
            Portal.canvas.HeaderCanvas.updateMouseState({
                click: true,
                x    : data.clientX - me.canvasRect.left,
                y    : data.clientY - me.canvasRect.top
            })
        }
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        if (this.isCanvasReady) {
            Portal.canvas.HeaderCanvas.updateMouseState({leave: true})
        }
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;

        if (me.isCanvasReady) {
            // We need coordinates relative to the canvas (which is at 0,0 of the toolbar)
            // The mouse event clientX/Y are global.
            // We need the canvas global rect to subtract.
            // For now, let's assume we can get the local coordinates if we trust the target?
            // No, the target is the button, not the canvas.
            // We need to fetch the canvas rect once or cache it.
            // Actually, we can just send clientX/Y and let the worker handle it if it knows the canvas global position?
            // Or better: calculate relative here.

            // Since this is high frequency, we don't want to await getDomRect every time.
            // We should cache the canvasPageRect in onResize/updateSize.

            if (me.canvasRect) {
                Portal.canvas.HeaderCanvas.updateMouseState({
                    x: data.clientX - me.canvasRect.left,
                    y: data.clientY - me.canvasRect.top
                })
            }
        }
    }

    /**
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;
        await me.updateSize(data.contentRect);
        await me.updateNavRects()
    }

    /**
     * @returns {Promise<void>}
     */
    async updateNavRects() {
        let me     = this,
            parent = Neo.get(me.parentId),
            ids    = [];

        if (!parent || !me.isCanvasReady) return;

        // Recursive helper to find all buttons
        const findButtons = (container) => {
            if (container.items) {
                container.items.forEach(item => {
                    if (item.ntype === 'button') {
                        ids.push(item.id)
                    } else if (item.items) {
                        findButtons(item)
                    }
                })
            }
        };

        findButtons(parent);

        if (ids.length > 0) {
            let rects      = await me.getDomRect(ids),
                canvasRect = await me.getDomRect(me.id);

            me.canvasRect = canvasRect; // Cache for mouse events

            if (rects && canvasRect) {
                me.navRects = rects.map((r, index) => {
                    if (!r) return null;
                    return {
                        id    : ids[index],
                        x     : r.x - canvasRect.x,
                        y     : r.y - canvasRect.y,
                        width : r.width,
                        height: r.height
                    }
                }).filter(Boolean);

                Portal.canvas.HeaderCanvas.updateNavRects({rects: me.navRects})
            }
        }
    }

    /**
     * @param {Object|null} rect
     */
    async updateSize(rect) {
        let me = this;

        if (!rect || rect.width === 0 || rect.height === 0) {
            rect = await me.getDomRect(me.id)
        }

        if (rect) {
            me.canvasRect = rect; // Cache for mouse events
            await Portal.canvas.HeaderCanvas.updateSize({width: rect.width, height: rect.height})
        }
    }
}

export default Neo.setupClass(HeaderCanvas);
