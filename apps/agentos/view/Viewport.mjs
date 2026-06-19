import Accounts           from './Accounts.mjs';
import BaseViewport       from '../../../src/container/Viewport.mjs';
import Dashboard          from '../../../src/dashboard/Container.mjs';
import FleetSettingsPanel from './FleetSettingsPanel.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class AgentOS.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOS.view.Viewport'
         * @protected
         */
        className: 'AgentOS.view.Viewport',
        /**
         * @member {String[]} cls=['agent-os-viewport']
         * @reactive
         */
        cls: ['agent-os-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The cockpit: a header toolbar (logo, title, theme switch) above a dashboard hosting the
         * Accounts + Fleet keeper-views. Renders through `neo-theme-neo-dark` / `neo-theme-neo-light`.
         * @member {Object[]} items
         */
        items: [{
            ntype: 'toolbar',
            cls  : ['agent-top-toolbar'],
            flex : 'none',
            items: [{
                ntype: 'component',
                cls  : ['agent-logo'],
                vdom : {cn: [{tag: 'img', src: '../../resources/images/logo/neo_logo_primary.svg', alt: 'Neo.mjs'}]}
            }, {
                ntype: 'label',
                text : 'Agent OS'
            }, '->', {
                ntype    : 'button',
                cls      : ['agent-button', 'agent-theme-button'],
                handler  : 'onSwitchTheme',
                iconCls  : 'fa-solid fa-moon',
                reference: 'theme-switch-button',
                tooltip  : {
                    text     : 'Switch theme',
                    showDelay: 0,
                    hideDelay: 0
                }
            }]
        }, {
            module           : Dashboard,
            cls              : ['agent-dashboard'],
            dragProxyExtraCls: ['agent-os-viewport', 'neo-viewport'],
            flex             : 1,
            popupUrl         : 'apps/agentos/childapps/widget/index.html',
            reference        : 'dashboard',
            sortGroup        : 'neo-connected-dashboard',
            style            : {margin: '20px'},

            items: [{
                module   : Accounts,
                flex     : 1,
                reference: 'accounts'
            }, {
                module   : FleetSettingsPanel,
                flex     : 1,
                reference: 'fleet'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
