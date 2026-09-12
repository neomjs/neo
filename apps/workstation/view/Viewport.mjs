import BaseViewport       from '../../../src/container/Viewport.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @summary Standalone viewport for the living-data Workstation flagship.
 *
 * The viewport owns only the render root. Workstation owns the state provider, dock document,
 * stores, pane cache, and deterministic tour so the application remains independently bootable.
 *
 * Three boot modes, read from the window's own search params:
 *
 * - default         → the dense living-data workspace (`Workspace`)
 * - `?popout=<id>`  → an EMPTY pop-out host: this window carries no workspace of its own; the
 *   opener's workspace reparents the live pane into this viewport (the shared-heap contract —
 *   one App Worker, two render targets; the dockdemo vessel-shell sibling pattern).
 * - `?workspace=<key>` → a render target for an already hydrated keyed document.
 *
 * Which mode applies — and whether this window creates a root or is adopted by the root that already
 * owns its Group — is its controller's decision. The view declares its class, its layout and that
 * controller, and reaches into nothing.
 *
 * @class Workstation.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Workstation.view.Viewport'
         * @protected
         */
        className: 'Workstation.view.Viewport',
        /**
         * @member {String[]} cls=['workstation-viewport']
         */
        cls: ['workstation-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(Viewport);
