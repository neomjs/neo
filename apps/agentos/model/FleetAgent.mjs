import Model from '../../../src/data/Model.mjs';

/**
 * @class AgentOS.model.FleetAgent
 * @extends Neo.data.Model
 *
 * @summary The cockpit fleet-roster record contract: one row per resident, keyed by the durable
 * `agentId`. The `fields` array IS the card's data contract — display state (`displayName`,
 * `avatarUrl`, `engineTag`, `family`, `laneLine`), the roster-DTO tri-state truths (`launchable`,
 * `openLaneCount`, `participationStatus` — stamped Brain-side, null = not stamped, never guessed),
 * session `state` (what the resident is doing now, never identity), per-source `sources`
 * provenance, and the B4/C2 lifecycle-control seam (`pendingAction`, `controlReason`) all live on
 * the record, so one Store of these records is the per-row reactive layer for the whole fleet
 * view. Sibling of {@link AgentOS.model.AgentDefinition}
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
            // The resident's mailbox identity authority (the GitHub username the AgentIdentity node
            // id derives from). Distinct from `agentId`, which is the Fleet registry key: a mailbox
            // subject is `@neo-opus-vega` while the registry key may be `vega`, and for custom /
            // multi-instance residents they need not correspond. Typeless so `null` survives — a
            // resident with no identity authority is honestly unverifiable, never implicitly matched.
            name: 'githubUsername'
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
            // The S2 wake telltale axis: the roster row's `{source, state, confidence, reason?}`
            // observation, where `state` is `on | off | suppressed | unknown`. Typeless so the
            // assembler's own shape survives untouched — the view must never re-derive this axis,
            // because `unknown` is a fact the PRODUCER emits (null resolver, unreadable source, or
            // an unwired producer) and a view that computed its own `unknown` could not tell "we
            // looked and cannot see" from "we never asked". null = the row carried no wake object.
            name        : 'wake',
            defaultValue: null
        }, {
            // The S2 throttle telltale axis, same contract as `wake`: `none | overage |
            // rate-limited | unknown`. Orthogonal to wake and never collapsed into one enum — the
            // incident this answers had both at once (wake hand-disabled AND a session rate limit),
            // and a single enum can only report one of them.
            name        : 'throttle',
            defaultValue: null
        }, {
            // The presence axis, same passthrough contract as `wake`/`throttle`: the
            // roster row's `{source, state, confidence, lastSeenAt, reason?, validationState?, since?}`
            // observation, where auth-validation provenance is passed through from who_is_online and
            // never inferred in the app. A fresh provider validation removes both optional fields on
            // the next Store update; the view owns no latch.
            // `state` is the plane's who_is_online band embryo (`online | idle | dark | benched |
            // neverConnected | unknown`). The THIRD independent signal — presence-fresh ≠
            // wake-route-healthy ≠ identity-bound — and the view never re-derives or fuses it.
            name        : 'presence',
            defaultValue: null
        }, {
            // the launch seam's derived launchability truth (a launch template exists for the
            // family), stamped Brain-side on the roster row; tri-state — true / false / null
            // (not read back yet) — so the field carries no type coercion
            name        : 'launchable',
            defaultValue: null
        }, {
            // open assigned lanes for the resident (measured density evidence: 7–17 per active
            // agent — one lane line cannot carry that truth, the count badge can). Owned by the
            // roster DTO end-to-end (assembler stamp → mapRosterRow → this record → the badge);
            // tri-state like `launchable`: null = no enricher has stamped a count, and the card
            // renders NO badge then, never a fake 0
            name        : 'openLaneCount',
            type        : 'Integer',
            defaultValue: null
        }, {
            // the newest attributable per-agent activity instant (ISO string), stamped Brain-side
            // by the cockpit DTO assembler (activity-event fold merged with the presence
            // producer's lastSeenAt) and passed through whole — the roster's recency sort axis.
            // Tri-state like `openLaneCount`: null = no attributable instant, and the sorter's
            // native null handling places such rows LAST — never a fabricated age, never
            // view-derived (a client-side fold would be a second truth the producer cannot correct)
            name        : 'lastActivityAt',
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
            // The roster's rank tier DERIVED from `state` — the default sort's leading axis,
            // expressed as a calculated field so "online first" is a plain store sorter instead of
            // a render-time partition: 0 = online (present and engaged: working, wedged or
            // rate-limited — a wedged agent is a thing the operator must SEE, never calm
            // background), 1 = idle (the calm middle, the collapsible tier), 2 = the tail
            // (benched / offline / unknown-guest). One derivation site; every consumer sorts on
            // the field
            name     : 'tierRank',
            calculate: data => {
                const {state} = data;

                return (state === 'ok' || state === 'wedged' || state === 'limited') ? 0 : state === 'idle' ? 1 : 2
            }
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
