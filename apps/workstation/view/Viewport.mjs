import BaseViewport from '../../../src/container/Viewport.mjs';
import Workspace    from './Workspace.mjs';

/**
 * @summary Standalone viewport for the living-data Workstation flagship.
 *
 * The viewport owns only the render root. Workstation owns the state provider, dock document,
 * stores, pane cache, and deterministic tour so the application remains independently bootable.
 *
 * Two boot modes, resolved from the window's own search params (async — the worker reads the
 * URL through the main-thread seam, so the workspace mounts in `onConstructed`):
 *
 * - default         → the dense living-data workspace (`Workspace`)
 * - `?popout=<id>`  → an EMPTY pop-out host: this window carries no workspace of its own; the
 *   opener's workspace reparents the live pane into this viewport (the shared-heap contract —
 *   one App Worker, two render targets; the dockdemo vessel-shell sibling pattern).
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
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Resolves the boot mode from the window URL and mounts the workspace — or nothing:
     * a pop-out vessel is a render target waiting for its live pane.
     */
    async onConstructed() {
        super.onConstructed();

        let me     = this,
            url    = await Neo.Main.getByPath({path: 'document.URL', windowId: me.windowId}),
            params = new URL(url).searchParams;

        if (me.isDestroyed) return;

        if (params.get('popout')) {
            me.addCls('workstation-popout-host');
            return
        }

        me.add({
            module: Workspace,
            flex  : 1
        })
    }
}

export default Neo.setupClass(Viewport);
