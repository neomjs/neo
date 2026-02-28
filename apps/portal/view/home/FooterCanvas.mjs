import SharedCanvas     from '../../../../src/app/SharedCanvas.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';

/**
 * @class Portal.view.home.FooterCanvas
 * @extends Neo.app.SharedCanvas
 */
class FooterCanvas extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.home.FooterCanvas'
         * @protected
         */
        className: 'Portal.view.home.FooterCanvas',
        /**
         * @member {String|null} activeId_=null
         * @reactive
         */
        activeId_: null,
        /**
         * @member {String[]} cls=['portal-footer-canvas']
         */
        cls: ['portal-footer-canvas'],
        /**
         * @member {String|null} hoverId_=null
         * @reactive
         */
        hoverId_: null,
        /**
         * @member {String} rendererClassName='Portal.canvas.FooterCanvas'
         */
        rendererClassName: 'Portal.canvas.FooterCanvas',
        /**
         * @member {String} rendererImportPath='apps/portal/canvas/FooterCanvas.mjs'
         */
        rendererImportPath: 'apps/portal/canvas/FooterCanvas.mjs',
        /**
         * @member {Object} style
         */
        style: {
            position: 'absolute',
            top     : 0,
            left    : 0,
            width   : '100%',
            height  : '100%',
            zIndex  : 0
        }
    }

    /**
     * @member {Object[]} navRects=null
     */
    navRects = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsCanvasReady(value, oldValue) {
        super.afterSetIsCanvasReady(value, oldValue);

        if (value && this.activeId) {
            this.renderer.updateActiveId({id: this.activeId})
        }
    }

    /**
     * Lifecycle hook triggered when the canvas is registered offscreen.
     * Initializes the Shared Worker graph and sets up resize observation.
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        await super.afterSetOffscreenRegistered(value, oldValue);

        if (value) {
            await this.updateNavRects()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    async afterSetActiveId(value, oldValue) {
        if (this.isCanvasReady) {
            await this.renderer.updateActiveId({id: value})
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    async afterSetHoverId(value, oldValue) {
        if (this.isCanvasReady) {
            await this.renderer.updateHoverId({id: value})
        }
    }

    /**
     * Updates the canvas size and re-calculates navigation rects on resize.
     * @param {Object} data
     */
    async onResize(data) {
        await super.onResize(data);
        await this.updateNavRects()
    }

    /**
     * Synchronizes the positions of the navigation buttons with the Shared Worker.
     *
     * @returns {Promise<void>}
     */
    async updateNavRects() {
        let me = this;

        if (!me.isCanvasReady) return;

        let parent  = Neo.get(me.parentId),
            buttons = ComponentManager.down(parent, 'button', false),
            ids     = buttons.map(button => button.id);

        if (ids.length > 0) {
            let rects      = await me.getDomRect(ids),
                canvasRect = await me.getDomRect(me.id);

            me.canvasRect = canvasRect; // Cache for mouse events

            if (rects && canvasRect) {
                // Normalize button rects to be relative to the canvas
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

                me.renderer.updateNavRects({rects: me.navRects})
            }
        }
    }
}

export default Neo.setupClass(FooterCanvas);
