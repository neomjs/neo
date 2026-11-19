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
         * The dashboard examples' shared palette, which this example's stylesheet reads
         * @member {String[]} additionalThemeFiles=['Neo.examples.dashboard.Palette']
         */
        additionalThemeFiles: ['Neo.examples.dashboard.Palette'],
        /**
         * @member {String[]} cls=['neo-example-tearout']
         * @reactive
         */
        cls: ['neo-example-tearout'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Reads this window's URL and mounts the claim line and the workspace, unless the window is a tear-out
     * target: that one is marked `tear-out-target` and stays empty.
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

        me.add([{
            cls : ['neo-example-tearout-claim'],
            flex: 'none',
            html: '<b>A pane keeps its live state in its own window.</b> ' +
                  'Type a draft in Notes, pop the pane out with its header\'s window action, then close that window: ' +
                  'the pane comes home with your draft.'
        }, {
            module: Workspace,
            flex  : 1
        }])
    }
}

export default Neo.setupClass(Viewport);
