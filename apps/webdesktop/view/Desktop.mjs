import Container       from '../../../src/container/Base.mjs';
import Launcher        from './Launcher.mjs';
import PermissionPanel from './PermissionPanel.mjs';
import Taskbar         from './Taskbar.mjs';

/**
 * @summary The signed-in desktop: the launcher over the wallpaper, the permission panel beside it, the taskbar below.
 * @class WebDesktop.view.Desktop
 * @extends Neo.container.Base
 */
class Desktop extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.Desktop'
         * @protected
         */
        className: 'WebDesktop.view.Desktop',
        /**
         * @member {String[]} baseCls=['webdesktop-desktop','neo-container']
         * @protected
         */
        baseCls: ['webdesktop-desktop', 'neo-container'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'container',
            cls      : ['webdesktop-workspace'],
            flex     : 1,
            layout   : {ntype: 'hbox', align: 'stretch'},
            reference: 'workspace',

            items: [{
                ntype : 'container',
                cls   : ['webdesktop-launcher-area'],
                flex  : 1,
                layout: {ntype: 'vbox', align: 'stretch'},

                items: [{
                    module   : Launcher,
                    flex     : 1,
                    listeners: {openApp: 'onLauncherOpenApp'},
                    reference: 'launcher'
                }, {
                    ntype: 'component',
                    bind : {hidden: data => data.permissions.length > 0},
                    cls  : ['webdesktop-empty'],
                    flex : 'none',
                    vdom : {cn: [
                        {tag: 'i', cls: ['fas', 'fa-lock']},
                        {tag: 'p', text: 'This account holds no permissions, so the desktop offers no apps.'}
                    ]}
                }]
            }, {
                module: PermissionPanel,
                bind  : {hidden: data => !data.permissionsPanel},
                flex  : 'none'
            }]
        }, {
            module: Taskbar,
            flex  : 'none'
        }]
    }
}

export default Neo.setupClass(Desktop);
