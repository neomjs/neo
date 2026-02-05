import SharedCanvas from '../../../../src/app/SharedCanvas.mjs';

/**
 * @summary The App Worker component for the Services "Neural Lattice" background.
 *
 * This component acts as the **Controller** and **Bridge** for the "Neural Lattice" visualization.
 * It does not perform any rendering itself. Instead, it coordinates the lifecycle and
 * data transfer to the `Portal.canvas.ServicesCanvas` (SharedWorker) which handles the physics and drawing.
 *
 * **Responsibilities:**
 * 1. **Lifecycle Management:** Imports and initializes the SharedWorker graph when the canvas
 *    becomes available offscreen via `afterSetOffscreenRegistered`.
 * 2. **Resize Observation:** Tracks the DOM element's size via `Neo.main.addon.ResizeObserver` and pushes
 *    dimensions to the worker to ensure the simulation matches the viewport.
 * 3. **Input Bridging:** Captures high-frequency mouse events (move, leave) from the parent container
 *    and forwards normalized coordinates to the worker for interactive physics.
 *
 * @class Portal.view.services.Canvas
 * @extends Neo.app.SharedCanvas
 * @see Portal.canvas.ServicesCanvas
 */
class Canvas extends SharedCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.services.Canvas'
         * @protected
         */
        className: 'Portal.view.services.Canvas',
        /**
         * @member {String[]} cls=['portal-services-canvas']
         * @reactive
         */
        cls: ['portal-services-canvas'],
        /**
         * @member {String} rendererClassName='Portal.canvas.ServicesCanvas'
         */
        rendererClassName: 'Portal.canvas.ServicesCanvas',
        /**
         * @member {String} rendererImportPath='apps/portal/canvas/ServicesCanvas.mjs'
         */
        rendererImportPath: 'apps/portal/canvas/ServicesCanvas.mjs'
    }
}

export default Neo.setupClass(Canvas);
