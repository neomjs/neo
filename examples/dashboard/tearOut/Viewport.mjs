import BaseViewport from '../../../src/container/Viewport.mjs';
import Workspace    from './Workspace.mjs';

/**
 * @summary Viewport of the minimal tear-out example: the engine's default window route, end to end.
 *
 * Every window of this app boots this class. The first window mounts the workspace. A window the
 * workspace opens for a torn-out pane reopens this same page with `?tearout=<itemId>` and mounts
 * nothing: it is an empty render target, and the workspace moves the live pane into it.
 * @class Neo.examples.dashboard.tearOut.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.tearOut.Viewport'
         * @protected
         */
        className: 'Neo.examples.dashboard.tearOut.Viewport',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Reads this window's URL and mounts the workspace, unless the window is a tear-out target:
     * that one is marked `tear-out-target` and stays empty.
     */
    async onConstructed() {
        super.onConstructed();

        let me  = this,
            url = await Neo.Main.getByPath({path: 'document.URL', windowId: me.windowId});

        if (me.isDestroyed) return;

        if (new URL(url).searchParams.has('tearout')) {
            me.addCls('tear-out-target');
            return
        }

        me.add({module: Workspace, flex: 1})
    }
}

export default Neo.setupClass(Viewport);
