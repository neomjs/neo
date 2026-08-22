import BaseViewport   from '../../../src/container/Viewport.mjs';
import DemoBWorkspace from './DemoBWorkspace.mjs';

/**
 * @summary Viewport of the cross-window dashboard example.
 *
 * Two boot modes, resolved from the window's own search params (async — the worker reads the URL
 * through the main-thread seam, so the workspace mounts in `onConstructed`):
 *
 * - default → the perspectives + pop-out workspace (`DemoBWorkspace`)
 * - `?popout=<id>` / `?workspaceId=demo-b-popup` → an EMPTY render target. This window carries no
 *   workspace of its own; the opener's workspace reparents the live pane into it on connect — the
 *   shared-heap contract, one App Worker, two render targets.
 *
 * The empty-host branch travelled here with `DemoBWorkspace` because it is that workspace's own
 * cross-window contract, not a property of the childapp the code used to live in.
 *
 * @class Neo.examples.dashboard.crossWindow.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.crossWindow.Viewport'
         * @protected
         */
        className: 'Neo.examples.dashboard.crossWindow.Viewport',
        /**
         * @member {String[]} cls=['agentos-dockdemo-viewport']
         */
        cls: ['agentos-dockdemo-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Resolves the boot mode from the window URL and mounts the workspace.
     * A pop-out window mounts NOTHING — it is a render target waiting for its pane.
     */
    async onConstructed() {
        super.onConstructed();

        let me     = this,
            url    = await Neo.Main.getByPath({path: 'document.URL', windowId: me.windowId}),
            params = new URL(url).searchParams;

        if (me.isDestroyed) return;

        if (params.get('popout') || params.get('workspaceId')) {
            me.addCls('agentos-dockdemo-popout-host');
            return
        }

        me.add({module: DemoBWorkspace, flex: 1})
    }
}

export default Neo.setupClass(Viewport);
