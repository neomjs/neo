import BaseViewport   from '../../../../../src/container/Viewport.mjs';
import DemoAWorkspace from './DemoAWorkspace.mjs';
import DemoBWorkspace from './DemoBWorkspace.mjs';

/**
 * @summary Viewport of the dock-demo childapp: mounts one of the showcase workspaces by URL.
 *
 * Three boot modes, resolved from the window's own search params (async — the worker reads
 * the URL through the main-thread seam, so the workspace mounts in `onConstructed`):
 *
 * - default        → Demo A (dock choreography — `DemoAWorkspace`)
 * - `?demo=b`      → Demo B (perspectives + pop-out — `DemoBWorkspace`)
 * - `?popout=<id>` → an EMPTY pop-out host: this window carries no workspace of its own;
 *   the opener's workspace reparents the live pane into this viewport on connect (the
 *   shared-heap contract — one App Worker, two render targets).
 *
 * @class AgentOS.childapps.dockdemo.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.Viewport'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.Viewport',
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
     * Resolves the boot mode from the window URL and mounts the matching workspace.
     * A pop-out window mounts NOTHING — it is a render target waiting for its pane.
     */
    async onConstructed() {
        super.onConstructed();

        let me     = this,
            url    = await Neo.Main.getByPath({path: 'document.URL', windowId: me.windowId}),
            params = new URL(url).searchParams;

        if (me.isDestroyed) return;

        if (params.get('popout')) {
            me.addCls('agentos-dockdemo-popout-host');
            return
        }

        me.add({
            module: params.get('demo') === 'b' ? DemoBWorkspace : DemoAWorkspace,
            flex  : 1
        })
    }
}

export default Neo.setupClass(Viewport);
