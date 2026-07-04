import Container     from '../../../../src/container/Base.mjs';
import FamilyRail    from './FamilyRail.mjs';
import Image         from '../../../../src/component/Image.mjs';
import StateDot      from './StateDot.mjs';
import StateProvider from '../../../../src/state/Provider.mjs';

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
                agentId    : null,
                avatarUrl  : null,
                displayName: null,
                engineTag  : null,
                family     : null,
                laneLine   : null,
                state      : 'off'
            }
        },
        /**
         * The card anatomy — family rail · avatar · body (name-row [state dot + name + engine tag] +
         * current-lane line). Each child binds to the per-card provider. Controls slot (T5) + foot
         * meta are sibling leaves.
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
        }]
    }
}

export default Neo.setupClass(AgentCard);
