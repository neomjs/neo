import Apps          from '../../../src/desktop/store/Apps.mjs';
import Component     from '../../../src/component/Base.mjs';
import Desktop       from '../../../src/desktop/Container.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary A web desktop from the engine's parts alone: `Neo.desktop.Container` over a `Neo.desktop.store.Apps` with
 * three apps, and no controller.
 * @description The launcher, the start menu and the window manager share the one apps store the view root's state
 * provider holds. Double-click an icon to open its app; minimize it and click its task to restore it; open a second
 * app and click the first one's window to bring it to the front. The launcher keeps the icons' order across reloads.
 * Each app opens its own view at its own size (`appWindowConfigs`), loaded on the app's first open. A shared worker
 * keeps the original app alive when dragging its window out of the desktop and back.
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
            module          : Desktop,
            tearOutUrl      : './index.html',
            appWindowConfigs: {
                calculator: {height: 460, width: 320, view: () => import('./Calculator.mjs')},
                music     : {height: 480, width: 720, view: () => import('./Music.mjs')},
                notes     : {height: 400, width: 460, view: () => import('./Notes.mjs')}
            },
            bind          : {appStore: 'stores.apps'},
            launcherConfig: {arrangementKey: 'neo-examples-desktop-basic'},
            taskbarConfig : {items: {'theme-switcher': {module: ThemeSwitcher, showText: false, weight: 90}}},
            // The screen says what it is: the product's name on the wallpaper, and a card beside the launcher
            items: {workspace: {items: {
                brand: {
                    module: Component,
                    cls   : ['desktop-basic-brand'],
                    text  : 'Neo Desktop',
                    weight: 5
                },
                about: {
                    module: Component,
                    cls   : ['desktop-basic-about'],
                    flex  : 'none',
                    weight: 20,
                    vdom  : {cn: [
                        {tag: 'h2', text: 'Neo Desktop'},
                        {tag: 'p',  text: 'A web desktop built from Neo.mjs. Its launcher, windows and taskbar are the engine\'s src/desktop, and all of it runs in a web worker, off the main thread.'},
                        {tag: 'p',  text: 'Drag a window by its title more than halfway past the desktop edge to pop it out. Drag back before releasing to keep it here.'},
                        {tag: 'a',  href: 'https://github.com/neomjs/neo/tree/dev/src/desktop', target: '_blank', text: 'src/desktop on GitHub'}
                    ]}
                }
            }}}
        }]
    }
}

export default Neo.setupClass(DesktopViewport);
