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
            module   : Desktop,
            bind     : {appStore: 'stores.apps', hidden: data => !data.account},
            flex     : 1,
            reference: 'desktop',
            items    : {
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
                        }
                    }
                }
            },
            taskbarConfig: {module: Taskbar},
            windowClass  : () => import('./AppWindow.mjs')
        }]
    }
}

export default Neo.setupClass(Viewport);
