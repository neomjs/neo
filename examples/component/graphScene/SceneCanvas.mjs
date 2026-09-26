import SharedCanvas      from '../../../src/app/SharedCanvas.mjs';
import {createDemoScene} from './demoScene.mjs';

/**
 * @summary The App Worker half of the example: a `Neo.app.SharedCanvas` whose renderer is the example's
 * `Neo.canvas.GraphScene` singleton. It sends the demo scene once the canvas is ready and again whenever
 * `nodeCount` changes, forwards the pointer so a drag orbits and the wheel zooms, and passes the renderer's
 * stats and context controls through to the page.
 *
 * @class Neo.examples.component.graphScene.SceneCanvas
 * @extends Neo.app.SharedCanvas
 */
class SceneCanvas extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.graphScene.SceneCanvas'
         * @protected
         */
        className: 'Neo.examples.component.graphScene.SceneCanvas',
        /**
         * The number of nodes of the demo scene.
         * @member {Number} nodeCount_=240
         * @reactive
         */
        nodeCount_: 240,
        /**
         * @member {String} rendererClassName='Neo.examples.component.graphScene.Renderer'
         */
        rendererClassName: 'Neo.examples.component.graphScene.Renderer',
        /**
         * @member {String} rendererImportPath='examples/component/graphScene/canvas/Renderer.mjs'
         */
        rendererImportPath: 'examples/component/graphScene/canvas/Renderer.mjs'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        // mousemove and wheel are not on the main thread's global target list: local listeners, the wheel
        // non-passive so the page does not scroll while the scene zooms
        me.addDomListeners([{
            mousedown : me.onMouseDown,
            mouseleave: me.onMouseLeave,
            mousemove : {fn: me.onMouseMove, local: true},
            mouseup   : me.onMouseUp,
            wheel     : {fn: me.onWheel, local: true, passive: false},
            scope     : me
        }])
    }

    /**
     * Triggered after the isCanvasReady config got changed: the first scene goes out here.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsCanvasReady(value, oldValue) {
        super.afterSetIsCanvasReady(value, oldValue);
        value && this.sendScene()
    }

    /**
     * Triggered after the nodeCount config got changed.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetNodeCount(value, oldValue) {
        this.isCanvasReady && this.sendScene()
    }

    /**
     * @summary The renderer's stats: camera, drawing buffer, counts, frames, context state.
     * @returns {Promise<Object>}
     */
    getStats() {
        return this.renderer.getStats({windowId: this.windowId})
    }

    /**
     * @summary Loses the renderer's context on purpose.
     * @returns {Promise<void>}
     */
    loseContext() {
        return this.renderer.loseContext({windowId: this.windowId})
    }

    /**
     * @summary Brings the renderer's context back.
     * @returns {Promise<void>}
     */
    restoreContext() {
        return this.renderer.restoreContext({windowId: this.windowId})
    }

    /**
     * @summary Sends the demo scene for the current `nodeCount`.
     * @returns {Promise<void>}
     */
    sendScene() {
        return this.renderer.setScene({...createDemoScene(this.nodeCount), windowId: this.windowId})
    }
}

export default Neo.setupClass(SceneCanvas);
