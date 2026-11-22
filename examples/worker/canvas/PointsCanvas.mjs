import SharedCanvas from '../../../src/app/SharedCanvas.mjs';

/**
 * @summary The App Worker half of the example: a `Neo.app.SharedCanvas` whose renderer draws a million points in
 * the canvas worker. It carries `data-drawn` once the first frame is painted, tells the renderer when the page is
 * about to block its main thread, and reads the renderer's frame count.
 *
 * @class Neo.examples.worker.canvas.PointsCanvas
 * @extends Neo.app.SharedCanvas
 */
class PointsCanvas extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Neo.examples.worker.canvas.PointsCanvas'
         * @protected
         */
        className: 'Neo.examples.worker.canvas.PointsCanvas',
        /**
         * @member {String} rendererClassName='Neo.examples.worker.canvas.Renderer'
         */
        rendererClassName: 'Neo.examples.worker.canvas.Renderer',
        /**
         * @member {String} rendererImportPath='examples/worker/canvas/canvas/Renderer.mjs'
         */
        rendererImportPath: 'examples/worker/canvas/canvas/Renderer.mjs'
    }

    /**
     * Triggered after the isCanvasReady config got changed: `drawn` follows the renderer's first frame.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetIsCanvasReady(value, oldValue) {
        super.afterSetIsCanvasReady(value, oldValue);

        if (value) {
            const
                me    = this,
                drawn = await me.renderer.whenDrawn({canvasId: me.getCanvasId(), windowId: me.windowId});

            if (!me.isDestroyed && me.isCanvasReady) {
                me.drawn = drawn
            }
        }
    }

    /**
     * @summary Tells the renderer that the main thread is about to be blocked, so the canvas says so itself.
     * @param {Number} duration In milliseconds
     * @returns {Promise<void>}
     */
    announceBlock(duration) {
        return this.renderer.announceBlock({canvasId: this.getCanvasId(), duration, windowId: this.windowId})
    }

    /**
     * @summary The renderer's stats: `{blocked, fps, frames, points}`.
     * @returns {Promise<Object>}
     */
    getStats() {
        return this.renderer.getStats({canvasId: this.getCanvasId(), windowId: this.windowId})
    }

    /**
     * @summary Sends the app's clock to the renderer, which draws it in the canvas. A canvas that is not ready yet
     * takes none.
     * @param {String} text
     * @returns {Promise<void>|undefined}
     */
    setClock(text) {
        if (this.isCanvasReady) {
            return this.renderer.setClock({canvasId: this.getCanvasId(), text, windowId: this.windowId})
        }
    }
}

export default Neo.setupClass(PointsCanvas);
