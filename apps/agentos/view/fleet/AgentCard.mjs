import AgentCardController from './AgentCardController.mjs';
import Button              from '../../../../src/button/Base.mjs';
import Container           from '../../../../src/container/Base.mjs';
import FamilyRail          from './FamilyRail.mjs';
import Image               from '../../../../src/component/Image.mjs';
import StateDot            from './StateDot.mjs';
import StateProvider       from '../../../../src/state/Provider.mjs';

/**
 * The resident card: the cockpit's atom. Composes the class-based fleet primitives (FamilyRail +
 * StateDot) with a profile avatar, name, engine tag, and current-lane line into the SSOT card
 * anatomy.
 *
 * **Data-driven from a per-card `state.Provider`** — the resident's display fields live in one place
 * (`stateProvider.data`) and every child `bind`s to it, so the whole card is ONE binding surface. A
 * consumer sets the fields at creation (`stateProvider: {data: {...}}`) or reactively via
 * `card.setState('displayName', …)`; there is no per-field config to thread.
 *
 * Render rules at card grain (the institution-cockpit render-model): **avatar**, **displayName**, and
 * **engineTag** are mutable versioned DISPLAY STATE over the durable `agentId` — setState on any of
 * them re-renders in place on the SAME card instance and NEVER re-keys (identity is the id, not the
 * presentation). The **family** rail rebinds in place on a family swap. Session **state** is what the
 * resident is doing now, never identity.
 *
 * The live roster / runtime-status wire binding and the NL-verified card wall are sibling leaves; this
 * leaf is the card component itself.
 *
 * @class AgentOS.view.fleet.AgentCard
 * @extends Neo.container.Base
 */
class AgentCard extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.AgentCard'
         * @protected
         */
        className: 'AgentOS.view.fleet.AgentCard',
        /**
         * @member {String} ntype='fm-agent-card'
         * @protected
         */
        ntype: 'fm-agent-card',
        /**
         * @member {String[]} baseCls=['fm-agent-card']
         */
        baseCls: ['fm-agent-card'],
        /**
         * Turns the controls-slot buttons into a single `lifecycleIntent` event (the B4 emit); the
         * Lane C (C2) round-trip consumes it. See {@link AgentOS.view.fleet.AgentCardController}.
         * @member {Object} controller={module:AgentCardController}
         */
        controller: {module: AgentCardController},
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * The per-card binding surface. `agentId` is the DURABLE identity — the one field that is
         * never presentation, never re-keyed; every other field is display state over it.
         * Session `state` is what the resident is doing now. Every child binds to these.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            data  : {
                agentId      : null,
                avatarUrl    : null,
                controlReason: null, // {action, kind, reason} of the last reject/unauthorized/timeout, set by Lane-C
                displayName  : null,
                engineTag    : null,
                family       : null,
                laneLine     : null,
                pendingAction: null, // the verb whose lifecycle round-trip is in flight, set by Lane-C; null when settled
                state        : 'off'
            }
        },
        /**
         * The card anatomy — family rail · avatar · body (name-row [state dot + name + engine tag] +
         * current-lane line) · controls slot (start/stop/restart → a single `lifecycleIntent` event
         * for the Lane C round-trip). Each child binds to the per-card provider; foot meta is a
         * sibling leaf.
         * @member {Object[]} items
         */
        items: [{
            module: FamilyRail,
            flex  : 'none',
            bind  : {family: data => data.family}
        }, {
            module: Image,
            cls   : ['fm-card-avatar'],
            flex  : 'none',
            bind  : {src: data => data.avatarUrl, alt: data => data.displayName}
        }, {
            ntype : 'container',
            cls   : ['fm-card-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},

            items: [{
                ntype : 'container',
                cls   : ['fm-card-name-row'],
                layout: {ntype: 'hbox', align: 'center'},

                items: [{
                    module: StateDot,
                    flex  : 'none',
                    bind  : {state: data => data.state}
                }, {
                    ntype: 'component',
                    cls  : ['fm-card-name'],
                    flex : 1,
                    bind : {text: data => data.displayName}
                }, {
                    ntype: 'component',
                    cls  : ['fm-card-engine'],
                    flex : 'none',
                    bind : {text: data => data.engineTag}
                }]
            }, {
                ntype: 'component',
                cls  : ['fm-card-lane'],
                bind : {text: data => data.laneLine}
            }]
        }, {
            ntype : 'container',
            cls   : ['fm-card-controls'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},

            items: [{
                ntype : 'container',
                cls   : ['fm-card-control-verbs'],
                layout: {ntype: 'hbox', align: 'center'},

                items: [{
                    module : Button,
                    action : 'start',
                    iconCls: 'fa-solid fa-play',
                    handler: 'onLifecycleIntent',
                    bind   : {disabled: data => data.pendingAction !== null || data.state === 'ok'}
                }, {
                    module : Button,
                    action : 'stop',
                    iconCls: 'fa-solid fa-stop',
                    handler: 'onLifecycleIntent',
                    bind   : {disabled: data => data.pendingAction !== null || data.state === 'off'}
                }, {
                    module : Button,
                    action : 'restart',
                    iconCls: 'fa-solid fa-rotate',
                    handler: 'onLifecycleIntent',
                    bind   : {disabled: data => data.pendingAction !== null || data.state === 'off'}
                }]
            }, {
                // Honest round-trip state: Lane-C sets pendingAction + controlReason on the provider (per
                // the B4/C2 contract); the card only RENDERS them — a verb stays pending until C2 settles,
                // and a rejection/unauthorized shows its reason. No optimistic success.
                ntype: 'component',
                cls  : ['fm-card-control-status'],
                bind : {
                    text  : data => data.controlReason
                        ? `⚠ ${data.controlReason.kind}: ${data.controlReason.reason}`
                        : (data.pendingAction ? `${data.pendingAction}…` : ''),
                    hidden: data => !data.pendingAction && !data.controlReason
                }
            }]
        }]
    }
}

export default Neo.setupClass(AgentCard);
