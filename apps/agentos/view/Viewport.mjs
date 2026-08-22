import Accounts           from './AccountsPanel.mjs';
import AgentDefinitions   from '../store/AgentDefinitions.mjs';
import BaseViewport       from '../../../src/container/Viewport.mjs';
import Dashboard          from '../../../src/dashboard/Container.mjs';
import FleetCockpit       from './fleet/cockpit/Container.mjs';
import FleetInstances     from '../store/FleetInstances.mjs';
import FleetTenants       from '../store/FleetTenants.mjs';
import InstanceSwitcher   from './fleet/instances/SwitcherButton.mjs';
import StateProvider      from '../../../src/state/Provider.mjs';
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
 *
 * The Viewport is also the composition authority between two deliberately separate projections:
 * Accounts owns `AgentDefinitions`, while FleetCockpit owns `FleetRoster`. An accepted definition
 * event is routed here so the cockpit can re-poll its Brain-side `fleetRoster()` assembler; neither
 * sibling reaches into or locally maps the other's store.
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
         * The shell-level shared-store host — the one sharing scope every consumer resolves
         * (Accounts writes into it; the cockpit's detail configuration tab reads it; each binds
         * or resolves the instance at construct, so a pop-out reparent keeps the reference).
         * Store classes are NOT singletons — the provider IS the sharing mechanism.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            data  : {
                // the bound instance's profileId — MIRRORED from the published bridge's
                // `profileId` (the SSOT) by the switch/boot owner; consumers bind, never derive
                boundProfileId: null,
                // the bound instance's connection state as a session-state key — written at the
                // spine banner's sync point, so the chrome dot and the banner share ONE truth
                instanceState: 'off'
            },
            stores: {
                agentDefinitions: {
                    module: AgentDefinitions
                },
                fleetInstances: {
                    module: FleetInstances
                },
                fleetTenants: {
                    module: FleetTenants
                }
            }
        },
        /**
         * Top chrome (logo · title · instance switcher · theme switch) over the left-rail
         * keeper-view nav. The switcher sits in the LEFT cluster directly after the title — scope
         * reads left-to-right: product → instance → everything below is instance-relative.
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
            }, {
                module   : InstanceSwitcher,
                reference: 'instance-switcher',
                bind     : {
                    boundProfileId: data => data.boundProfileId,
                    instanceState : data => data.instanceState,
                    instanceStore : 'stores.fleetInstances'
                },
                listeners: {
                    manageinstances: 'onManageInstances',
                    switchinstance : 'onSwitchInstance'
                }
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
                header: {iconCls: 'fa-solid fa-house', route: '/home', text: 'Home'},
                html  : '<div class="agent-welcome-inner">' +
                            '<p class="agent-welcome-eyebrow">Neo Agent OS</p>' +
                            '<h1 class="agent-welcome-h1">Mission control for a cross-model AI engineering team.</h1>' +
                            '<p class="agent-welcome-lede">Your fleet\'s state at a glance, its work streaming in real time, commanded from the cockpit — not a terminal. Select <b>Fleet</b> in the rail to enter mission control.</p>' +
                        '</div>'
            }, {
                module   : FleetCockpit,
                header   : {iconCls: 'fa-solid fa-satellite-dish', route: '/fleet', text: 'Fleet'},
                reference: 'fleet-cockpit'
            }, {
                // Accounts is likewise a dashboard.Panel — its own dashboard.Container host so the
                // identity panel keeps the pop-out affordance and stays structurally idiomatic.
                module   : Dashboard,
                cls      : ['agent-accounts-dashboard'],
                header   : {iconCls: 'fa-solid fa-id-badge', route: '/accounts', text: 'Accounts'},
                popupUrl : 'apps/agentos/childapps/widget/index.html',
                sortGroup: 'neo-connected-dashboard',

                items: [{
                    module   : Accounts,
                    flex     : 1,
                    listeners: {agentDefinitionAccepted: 'up.onAgentDefinitionAccepted'},
                    reference: 'accounts'
                }]
            }, {
                ntype : 'component',
                cls   : ['agent-placeholder'],
                header: {iconCls: 'fa-solid fa-comments', route: '/chat', text: 'Chat'},
                html  : '<div class="agent-placeholder-inner">Chat — prompt an agent → a live widget pane you can dock and pop out. The dockable QT work-area lands here next.</div>'
            }]
        }]
    }

    /**
     * @summary Route an accepted Accounts definition across the keeper-view composition boundary:
     * FleetCockpit re-polls the Brain's authoritative roster assembler into its own FleetRoster
     * store. Invalid events or an absent cockpit fail closed without a sibling-store mutation.
     * @param {Object} data
     * @param {Object} data.agent Canonical public agent definition accepted by Accounts.
     * @returns {Promise<Boolean>} True after the cockpit refresh settles; false when no valid route exists.
     */
    async onAgentDefinitionAccepted({agent}={}) {
        const
            me      = this,
            cockpit = me.getReference('fleet-cockpit');

        if (!agent?.id) {
            return false
        }

        // land the canonical readback in the shared definitions store: the S5 zone's form ends at
        // this event by design (the mount owner writes), and the config tab reads the same rows.
        // Accounts upserts its own row before firing, so this is idempotent for that path; with
        // no provider in reach (bare mounts) the write degrades away and the roster refresh stands.
        const
            store  = me.getStateProvider?.()?.getStore('agentDefinitions'),
            record = store?.get(agent.id);

        record ? record.set(agent) : store?.add(agent);

        if (typeof cockpit?.loadRoster !== 'function') {
            return false
        }

        await cockpit.loadRoster();

        return true
    }
}

export default Neo.setupClass(Viewport);
