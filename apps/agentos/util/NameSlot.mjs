import Base from '../../../src/core/Base.mjs';

/**
 * @summary The FM cockpit name-slot contract — the render-correctness rule at name grain: the
 * social display name renders as MUTABLE DISPLAY STATE over the durable id (never as a key), and
 * its provenance is stated honestly. Today's live vocabulary is TWO states: `declared-proxy`
 * (a name exists as registry/identity display state; no assent trail is wired anywhere yet) and
 * `durable-id` (no display name — the never-renamed anchor itself renders). Pure and
 * record-shaped (no clock, no instance coupling); fails closed toward the durable id exactly like
 * the sibling {@link module:apps/agentos/util/AgentFreshness} contract fails toward
 * `unobserved`.
 *
 * **The fallback chain is folded Brain-side** (`ai/services/fleet/fleetCockpitStatus.mjs` — the
 * cockpit DTO assembler resolves `displayName → name → githubUsername → id` into ONE
 * `displayName` field, the CARD-CONTRACT row). This module deliberately does NOT re-implement
 * that chain: a Body-side copy would be a second truth that drifts. It consumes the folded field
 * and owns only the view-grain safety net — a record with no folded display name (a non-DTO row,
 * a sparse fixture) renders its durable id in the mono register, never a blank name slot.
 *
 * **`naming-layer` is a RESERVED state, not a live one.** The naming-layer plumbing (the
 * sketch/assent trail of the peer-naming ritual) is explicitly outside this leaf: the live
 * `FleetAgent` record contract carries no `nameProvenance` field, so no store-backed record can
 * reach the state today — and this classifier honestly refuses to emit it. The state stays in the
 * closed vocabulary and in {@link describeNameProvenance}'s presentation map so the activation
 * leaf (the record-contract + feed + trail-render work, tracked in the naming-layer orbit) flips
 * ONE classifier branch when the field is real — that leaf must also render the trail FACTS into
 * the reachable title/aria surface, and should guard its input with the sibling
 * `AgentFreshness.mjs` prototype-checked plain-object discipline.
 *
 * @module apps/agentos/util/NameSlot
 */

/**
 * Static Fleet name-slot and provenance presentation utilities.
 * @class AgentOS.util.NameSlot
 * @extends Neo.core.Base
 */
class NameSlot extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.util.NameSlot'
         * @protected
         */
        className: 'AgentOS.util.NameSlot'
    }

    /**
     * The closed provenance vocabulary. `declared-proxy` and `durable-id` are the live states;
     * `naming-layer` is RESERVED for the activation leaf (see the module summary) — present here so
     * the presentation map and the eventual classifier branch share one vocabulary, but never emitted
     * by {@link resolveNameSlot} today.
     * @type {String[]}
     */
    static NAME_PROVENANCE_STATES = Object.freeze(['naming-layer', 'declared-proxy', 'durable-id'])

    /**
     * @summary Resolve one record's name slot, honestly. The folded display name renders when
     * present; otherwise the durable `agentId` renders in its place (flagged, so consumers switch to
     * the mono id register); a record with neither renders the explicit `—` empty marker. Provenance
     * classifies from what is mechanically true today: a name is `declared-proxy` (display state,
     * trail not wired — any trail-shaped field on the input is IGNORED, since the live record
     * contract cannot carry one), no name is `durable-id`.
     * @param {Object|null} record A FleetAgent record or same-keyed field bag (`displayName`, `agentId`).
     * @returns {{text: String, isFallback: Boolean, provenance: {state: String, label: String}}}
     */
    static resolveNameSlot(record) {
        const
            displayName = typeof record?.displayName === 'string' && record.displayName.trim() !== '' ? record.displayName : null,
            agentId     = typeof record?.agentId === 'string' && record.agentId.trim() !== '' ? record.agentId : null;

        if (!displayName) {
            return {
                text      : agentId ?? '—',
                isFallback: true,
                provenance: {
                    state: 'durable-id',
                    label: agentId
                        ? 'Durable id — no display name declared; the id is the never-renamed anchor'
                        : 'No identity facts on this record'
                }
            }
        }

        return {
            text      : displayName,
            isFallback: false,
            provenance: {
                state: 'declared-proxy',
                label: `"${displayName}" is declared display state over the durable id${agentId ? ` ${agentId}` : ''} — the naming-layer assent trail is not wired yet`
            }
        }
    }

    /**
     * @summary The compact chip rendering for one provenance state — calibrated to the density
     * surface: a uniform signal carries no per-card information, so each state renders only what
     * differentiates it. `declared-proxy` (today's uniform reality) renders a quiet outline glyph
     * with the long copy on title/aria; `durable-id` renders NO chip at all — the name slot's mono-id
     * register IS that signal, and a chip beside it would state the same fact twice; `naming-layer`
     * (the RESERVED future divergent state) already maps to the word `named`, so the activation leaf
     * changes no presentation code.
     * @param {String} state One of {@link NAME_PROVENANCE_STATES}.
     * @returns {{cls: String[], hidden: Boolean, text: String}}
     */
    static describeNameProvenance(state) {
        return {
            cls   : ['fm-name-provenance', `is-${state}`],
            hidden: state === 'durable-id',
            text  : state === 'naming-layer' ? 'named' : state === 'declared-proxy' ? '◇' : ''
        }
    }
}

export default Neo.setupClass(NameSlot);
