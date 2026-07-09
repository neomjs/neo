import FleetAgentModel from '../model/FleetAgent.mjs';
import Store           from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.FleetRoster
 * @extends Neo.data.Store
 *
 * @summary The cockpit fleet roster — ONE Store of {@link AgentOS.model.FleetAgent} records as the
 * single source of truth for every fleet surface (the ranked card grid, the health bar, the
 * lifecycle-control round-trip). Exposed as a **singleton** so the keeper-views share one instance.
 *
 * Seeded with the seven real cross-family maintainer identities — the live-wire binding
 * (`FleetCockpit.loadRoster()` consuming the registry bridge) replaces this seed when the roster
 * source is wired. Identities + avatars are real (the `githubAvatarUrl` pattern, so identity reads
 * at a glance); session state + lane-line are an illustrative snapshot until the live source is
 * wired. NO invented agents.
 */
class FleetRoster extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.FleetRoster'
         * @protected
         */
        className: 'AgentOS.store.FleetRoster',
        /**
         * @member {Boolean} singleton=true
         */
        singleton: true,
        /**
         * The durable identity key. Declared on the store as well as the model: the collection
         * layer defaults `keyProperty` to `'id'`, which always wins the store-level
         * `this.keyProperty || this.model.keyProperty` fallback — so the model's `agentId` must be
         * mirrored here to take effect.
         * @member {String} keyProperty='agentId'
         */
        keyProperty: 'agentId',
        /**
         * @member {Object[]} data
         */
        data: [
            {agentId: 'neo-opus-grace', displayName: 'Grace',     engineTag: 'opus-4.8', family: 'claude', state: 'ok',   avatarUrl: 'https://github.com/neo-opus-grace.png?size=80', laneLine: 'design authority — cockpit SSOT conformance review'},
            {agentId: 'neo-gpt',        displayName: 'Euclid',    engineTag: 'gpt-5.6-sol', family: 'gpt',   state: 'ok',   avatarUrl: 'https://github.com/neo-gpt.png?size=80',        laneLine: 'NL transaction archive + replay'},
            {agentId: 'neo-opus-ada',   displayName: 'Ada',       engineTag: 'opus-4.8', family: 'claude', state: 'ok',   avatarUrl: 'https://github.com/neo-opus-ada.png?size=80',   laneLine: 'control-plane restart actuator — the R3 seam'},
            {agentId: 'neo-opus-vega',  displayName: 'Vega',      engineTag: 'opus-4.8', family: 'claude', state: 'ok',   avatarUrl: 'https://github.com/neo-opus-vega.png?size=80',  laneLine: 'harness-UI shell + left-rail nav'},
            {agentId: 'neo-fable',      displayName: 'Mnemosyne', engineTag: 'fable-5',  family: 'claude', state: 'ok',   avatarUrl: 'https://github.com/neo-fable.png?size=80',      laneLine: 'golden-path direction-velocity writer'},
            {agentId: 'neo-fable-clio', displayName: 'Clio',      engineTag: 'fable-5',  family: 'claude', state: 'idle', avatarUrl: 'https://github.com/neo-fable-clio.png?size=80', laneLine: 'CrossWindowDragTarget docking — awaiting review'},
            {agentId: 'neo-gemini-pro', displayName: 'Gemini',    engineTag: '3.1-pro',     family: 'gemini', state: 'off',  avatarUrl: 'https://github.com/neo-gemini-pro.png?size=80', laneLine: 'operator-benched'}
        ],
        /**
         * @member {Neo.data.Model} model=FleetAgentModel
         * @reactive
         */
        model: FleetAgentModel
    }
}

export default Neo.setupClass(FleetRoster);
