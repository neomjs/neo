import BaseViewport          from '../../../src/container/Viewport.mjs';
import Component             from '../../../src/component/Base.mjs';
import Desktop               from '../../../src/desktop/Container.mjs';
import PermissionPanel       from './PermissionPanel.mjs';
import SignIn                from './SignIn.mjs';
import Taskbar               from './Taskbar.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @summary The wallpaper and the root: the sign-in screen while nobody is signed in, the engine's desktop afterwards.
 *
 * The desktop (`Neo.desktop.Container`) gets this demo's own parts by key: the permission panel beside the launcher,
 * a note over a launcher with no apps, and its taskbar items (`WebDesktop.view.Taskbar`).
 * @class WebDesktop.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.Viewport'
         * @protected
         */
        className: 'WebDesktop.view.Viewport',
        /**
         * @member {String[]} cls=['webdesktop-viewport']
         */
        cls: ['webdesktop-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: SignIn,
            bind  : {hidden: data => Boolean(data.account)},
            flex  : 1
        }, {
            module    : Desktop,
            bind      : {appStore: 'stores.apps', hidden: data => !data.account},
            flex      : 1,
            reference : 'desktop',
            tearOutUrl: './index.html',
            items     : {
                workspace: {
                    items: {
                        empty: {
                            module: Component,
                            bind  : {hidden: data => data.permissions.length > 0},
                            cls   : ['webdesktop-empty'],
                            weight: 20,
                            vdom  : {cn: [
                                {tag: 'i', cls: ['fas', 'fa-lock']},
                                {tag: 'p', text: 'This account holds no permissions, so the desktop offers no apps.'}
                            ]}
                        },
                        permissions: {
                            module: PermissionPanel,
                            bind  : {hidden: data => !data.permissionsPanel},
                            flex  : 'none',
                            weight: 30
                        },
                        // The screen says what it is: the name on the wallpaper, and a card the permission panel replaces
                        brand: {
                            module: Component,
                            cls   : ['webdesktop-brand'],
                            text  : 'Neo.mjs Web Desktop',
                            weight: 5
                        },
                        about: {
                            module: Component,
                            bind  : {hidden: data => data.permissionsPanel},
                            cls   : ['webdesktop-about'],
                            flex  : 'none',
                            weight: 25,
                            vdom  : {cn: [
                                {tag: 'h2', text: 'Neo.mjs Web Desktop'},
                                {tag: 'p',  text: 'Sign in as another account, and the launcher, the start menu and the open windows follow its permissions. The shell is the engine\'s src/desktop, running in a web worker.'},
                                {tag: 'a',  href: 'https://github.com/neomjs/neo/tree/dev/src/desktop', target: '_blank', text: 'src/desktop on GitHub'}
                            ]}
                        }
                    }
                }
            },
            // Each app's view loads on its first open, in a window sized for it
            appWindowConfigs: {
                calendar     : {height: 600, width: 920, view: () => import('./apps/Calendar.mjs')},
                documents    : {height: 480, width: 800, view: () => import('./apps/Documents.mjs')},
                help         : {height: 560, width: 640, view: () => import('./apps/Help.mjs')},
                mail         : {height: 520, width: 880, view: () => import('./apps/Mail.mjs')},
                messages     : {height: 500, width: 720, view: () => import('./apps/Messages.mjs')},
                music        : {height: 480, width: 720, view: () => import('./apps/Music.mjs')},
                photos       : {height: 520, width: 760, view: () => import('./apps/Photos.mjs')},
                'recycle-bin': {height: 400, width: 680, view: () => import('./apps/RecycleBin.mjs')},
                reports      : {height: 380, width: 760, view: () => import('./apps/Reports.mjs')},
                settings     : {height: 600, width: 480, view: () => import('./apps/Settings.mjs')}
            },
            taskbarConfig: {module: Taskbar}
        }]
    }
}

export default Neo.setupClass(Viewport);
