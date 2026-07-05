import Accounts           from './Accounts.mjs';
import BaseViewport       from '../../../src/container/Viewport.mjs';
import FleetCockpit       from './fleet/FleetCockpit.mjs';
import TabContainer       from '../../../src/tab/Container.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class AgentOS.view.Viewport
 * @extends Neo.container.Viewport
 *
 * @summary The harness shell — the B3-hybrid keeper-view structure: a top chrome bar over a
 * stable-shell **left-rail keeper-view nav** (`tab.Container`, left tab-bar). The rail is how you
 * reach the keeper views — **Home** (the Welcome landing), **Fleet** (the FM mission-control
 * cockpit, the default), **Accounts** (identity setup), **Chat** (prompt → live pane, the dockable
 * work-area seam). The Fleet keeper-view renders the roster as CARDS (the design SSOT), not a
 * data-grid table. Renders through `neo-theme-neo-dark` / `neo-theme-neo-light`.
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
         * Top chrome (logo · title · theme switch) over the left-rail keeper-view nav.
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
            module        : TabContainer,
            cls           : ['agent-shell'],
            flex          : 1,
            reference     : 'shell',
            tabBarPosition: 'left',
            activeIndex   : 1, // default to the Fleet cockpit — mission control first

            items: [{
                ntype : 'component',
                cls   : ['agent-welcome'],
                header: {iconCls: 'fa-solid fa-house', text: 'Home'},
                html  : '<div class="agent-welcome-inner">' +
                            '<p class="agent-welcome-eyebrow">Neo Agent OS</p>' +
                            '<h1 class="agent-welcome-h1">Mission control for a cross-model AI engineering team.</h1>' +
                            '<p class="agent-welcome-lede">Your fleet\'s state at a glance, its work streaming in real time, commanded from the cockpit — not a terminal. Select <b>Fleet</b> in the rail to enter mission control.</p>' +
                        '</div>'
            }, {
                module: FleetCockpit,
                header: {iconCls: 'fa-solid fa-satellite-dish', text: 'Fleet'}
            }, {
                module: Accounts,
                header: {iconCls: 'fa-solid fa-id-badge', text: 'Accounts'}
            }, {
                ntype : 'component',
                cls   : ['agent-placeholder'],
                header: {iconCls: 'fa-solid fa-comments', text: 'Chat'},
                html  : '<div class="agent-placeholder-inner">Chat — prompt an agent → a live widget pane you can dock and pop out. The dockable QT work-area lands here next.</div>'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
