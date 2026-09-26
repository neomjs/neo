import GraphScene from '../../../../src/canvas/GraphScene.mjs';

/**
 * @summary The example's graph renderer: `Neo.canvas.GraphScene` as a canvas-worker singleton, plus two
 * controls that make a lost context reproducible on demand (`WEBGL_lose_context`), so the page and its
 * e2e can watch the scene come back.
 *
 * @class Neo.examples.component.graphScene.Renderer
 * @extends Neo.canvas.GraphScene
 * @singleton
 */
class Renderer extends GraphScene {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.graphScene.Renderer'
         * @protected
         */
        className: 'Neo.examples.component.graphScene.Renderer',
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'getStats',
                'initGraph',
                'loseContext',
                'pause',
                'pick',
                'restoreContext',
                'resume',
                'setScene',
                'setTheme',
                'updateMouseState',
                'updateSize'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The `WEBGL_lose_context` extension, kept from the loss so the restore can reach it.
     * @member {WEBGL_lose_context|null} loseExtension=null
     */
    loseExtension = null

    /**
     * @summary Loses the context the way a GPU reset would.
     */
    loseContext() {
        const me = this;

        me.loseExtension = me.gl?.getExtension('WEBGL_lose_context') ?? null;
        me.loseExtension?.loseContext()
    }

    /**
     * @summary Brings the lost context back; the renderer's restore handler redraws the kept scene.
     */
    restoreContext() {
        this.loseExtension?.restoreContext()
    }
}

export default Neo.setupClass(Renderer);
