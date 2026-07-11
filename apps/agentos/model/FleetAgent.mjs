import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.FleetAgent
 * @extends Neo.data.Model
 *
 * @summary The cockpit fleet-roster record contract: one row per resident, keyed by the durable
 * `agentId`. The `fields` array IS the card's data contract — display state (`displayName`,
 * `avatarUrl`, `engineTag`, `family`, `laneLine`), session `state` (what the resident is doing
 * now, never identity), per-source `sources` provenance, and the B4/C2 lifecycle-control seam
 * (`pendingAction`, `controlReason`) all live on the record, so one Store of these records is the
 * per-row reactive layer for the whole fleet view. Sibling of {@link AgentOS.model.AgentDefinition}
 * (the credential-side definition shape); this model carries no credential field by design.
 */
class FleetAgent extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.FleetAgent'
         * @protected
         */
        className: 'AgentOS.model.FleetAgent',
        /**
         * The durable identity — the one field that is never presentation and never re-keys.
         * @member {String} keyProperty='agentId'
         * @reactive
         */
        keyProperty: 'agentId',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'agentId',
            type: 'String'
        }, {
            name: 'avatarUrl',
            type: 'String'
        }, {
            // {action, kind, reason} of the last reject / unauthorized / timeout, written by the
            // C2 adapter; null when no terminal reason is showing
            name        : 'controlReason',
            type        : 'Object',
            defaultValue: null
        }, {
            // the launch seam's per-family auth mode ('marker' | 'in-app'), stamped Brain-side on
            // the roster row; null = not read back / unlaunchable — tri-state, never guessed
            name        : 'authMode',
            defaultValue: null
        }, {
            name: 'displayName',
            type: 'String'
        }, {
            name: 'engineTag',
            type: 'String'
        }, {
            name: 'family',
            type: 'String'
        }, {
            name: 'laneLine',
            type: 'String'
        }, {
            // the launch seam's derived launchability truth (a launch template exists for the
            // family), stamped Brain-side on the roster row; tri-state — true / false / null
            // (not read back yet) — so the field carries no type coercion
            name        : 'launchable',
            defaultValue: null
        }, {
            // open assigned lanes for the resident (measured density evidence: 7–17 per active
            // agent — one lane line cannot carry that truth, the count badge can). null = the
            // lane producer has not reported; the card renders NO badge then, never a fake 0
            name        : 'openLaneCount',
            type        : 'Integer',
            defaultValue: null
        }, {
            // the AUTHORITATIVE swarm-participation fact from the identity roots ('active' |
            // 'operator_benched' | 'temporarily_unreachable'), resolved Brain-side through the
            // identity join seam; typeless so null (no identity root / not stamped) survives —
            // fleet-level eligibility excludes any KNOWN non-active status before a lifecycle
            // write (null stays eligible: the open-set case for forks/custom residents)
            name        : 'participationStatus',
            defaultValue: null
        }, {
            // the verb whose lifecycle round-trip is in flight, written by the C2 adapter;
            // null when settled
            name        : 'pendingAction',
            type        : 'String',
            defaultValue: null
        }, {
            // session state — what the resident is doing NOW (`ok` · `idle` · `wedged` ·
            // `limited` · `off`), never identity
            name        : 'state',
            type        : 'String',
            defaultValue: 'off'
        }, {
            // normalized `fleetCockpitStatus.rows[*].sources`: roster / repoStatus / runtime
            // provenance. Replaced as one Object on each snapshot so Store recordChange remains
            // the single reactive path; no nested per-card state layer.
            name        : 'sources',
            type        : 'Object',
            defaultValue: null
        }]
    }
}

export default Neo.setupClass(FleetAgent);
