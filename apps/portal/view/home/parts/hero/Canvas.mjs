import SharedCanvas from '../../../../../../src/app/SharedCanvas.mjs';

/**
 * @summary The App Worker component for the Home Hero "Neural Swarm" canvas.
 *
 * This component acts as the **Controller** and **Bridge** for the visual effect.
 * It does not perform any rendering itself. Instead, it coordinates the lifecycle and
 * data transfer to the `Portal.canvas.HomeCanvas` (SharedWorker) which handles the physics and drawing.
 *
 * **Responsibilities:**
 * 1. **Lifecycle Management:** Imports and initializes the SharedWorker graph when the canvas
 *    becomes available offscreen.
 * 2. **Resize Observation:** Tracks the DOM element's size via `ResizeObserver` and pushes
 *    dimensions to the worker to ensure the simulation matches the viewport.
 * 3. **Input Bridging:** Captures high-frequency mouse events (move, click, leave) and
 *    forwards normalized coordinates to the worker for interactive physics.
 *
 * @class Portal.view.home.parts.hero.Canvas
 * @extends Neo.app.SharedCanvas
 * @see Portal.canvas.HomeCanvas
 */
class CanvasComponent extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.hero.Canvas'
         * @protected
         */
        className: 'Portal.view.home.parts.hero.Canvas',
        /**
         * @member {String[]} cls=['portal-home-hero-canvas']
         */
        cls: ['portal-home-hero-canvas'],
        /**
         * @member {String} rendererClassName='Portal.canvas.HomeCanvas'
         */
        rendererClassName: 'Portal.canvas.HomeCanvas',
        /**
         * @member {String} rendererImportPath='apps/portal/canvas/HomeCanvas.mjs'
         */
        rendererImportPath: 'apps/portal/canvas/HomeCanvas.mjs'
    }
}

export default Neo.setupClass(CanvasComponent);
