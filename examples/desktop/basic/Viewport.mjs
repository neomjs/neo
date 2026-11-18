import Apps          from '../../../src/desktop/store/Apps.mjs';
import AppWindow     from './AppWindow.mjs';
import Desktop       from '../../../src/desktop/Container.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary A web desktop from the engine's parts alone: `Neo.desktop.Container` over a `Neo.desktop.store.Apps` with
 * three apps, and no controller.
 * @description The launcher, the start menu and the window manager share the one apps store the view root's state
 * provider holds. Double-click an icon to open its app; minimize it and click its task to restore it; open a second
 * app and click the first one's window to bring it to the front. The launcher keeps the icons' order across reloads.
 * @class Neo.examples.desktop.basic.Viewport
 * @extends Neo.container.Viewport
 */
class DesktopViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.desktop.basic.Viewport'
         * @protected
         */
        className: 'Neo.examples.desktop.basic.Viewport',
        /**
         * @member {String[]} cls=['desktop-basic-example']
         */
        cls: ['desktop-basic-example'],
        /**
         * @member {Object} layout='fit'
         */
        layout: 'fit',
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                apps: {
                    module: Apps,
                    data  : [
                        {id: 'tools',      text: 'Tools',      iconCls: 'fas fa-toolbox', isLeaf: false, collapsed: false},
                        {id: 'notes',      text: 'Notes',      iconCls: 'fas fa-note-sticky', parentId: 'tools', color: '#eab308', description: 'Write things down before they slip away.'},
                        {id: 'calculator', text: 'Calculator', iconCls: 'fas fa-calculator',  parentId: 'tools', color: '#3b82f6', description: 'Add up what the notes promised.'},
                        {id: 'music',      text: 'Music',      iconCls: 'fas fa-music',       parentId: 'tools', color: '#a855f7', description: 'Play something while you work.'}
                    ]
                }
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module        : Desktop,
            bind          : {appStore: 'stores.apps'},
            launcherConfig: {arrangementKey: 'neo-examples-desktop-basic'},
            windowClass   : AppWindow
        }]
    }
}

export default Neo.setupClass(DesktopViewport);
