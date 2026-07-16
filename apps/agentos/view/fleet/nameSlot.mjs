/**
 * @summary The FM cockpit name-slot contract — the render-correctness rule at name grain: the
 * social display name renders as MUTABLE DISPLAY STATE over the durable id (never as a key), and
 * its provenance is stated honestly — a wired naming-layer trail when the record carries one, the
 * explicit `declared-proxy` state until that layer lands. Pure and record-shaped (no clock, no
 * instance coupling); fail-closed toward the durable id exactly like the sibling
 * {@link module:apps/agentos/view/fleet/agentFreshness} contract fails toward `unobserved`.
 *
 * **The fallback chain is folded Brain-side** (`src/ai/fleet/fleetCockpitStatus.mjs` — the
 * cockpit DTO assembler resolves `displayName → name → githubUsername → id` into ONE
 * `displayName` field, the CARD-CONTRACT row). This module deliberately does NOT re-implement
 * that chain: a Body-side copy would be a second truth that drifts. It consumes the folded field
 * and owns only the view-grain safety net — a record with no folded display name (a non-DTO row,
 * a sparse fixture) renders its durable id in the mono register, never a blank name slot.
 *
 * **Provenance sharpens with no view change:** today no naming-layer feed stamps a trail, so
 * every named record classifies `declared-proxy` — the name is declared registry/identity display
 * state, its sketch/assent trail not yet wired. The moment a feed stamps `nameProvenance` on the
 * record, the same call classifies `naming-layer` and surfaces the trail. Every rendered claim
 * stays witness, not authority.
 *
 * @module apps/agentos/view/fleet/nameSlot
 */

/**
 * The closed provenance vocabulary. `naming-layer` = the record carries a wired sketch/assent
 * trail; `declared-proxy` = the name is declared display state with no trail wired yet;
 * `durable-id` = no display name at all — the slot renders the never-renamed anchor itself.
 * @type {String[]}
 */
export const NAME_PROVENANCE_STATES = Object.freeze(['naming-layer', 'declared-proxy', 'durable-id']);

/**
 * @summary Resolve one record's name slot, honestly. The folded display name renders when
 * present; otherwise the durable `agentId` renders in its place (flagged, so consumers switch to
 * the mono id register); a record with neither renders the explicit `—` empty marker. The
 * provenance classifies from the record's `nameProvenance` trail: present → `naming-layer` (trail
 * passed through verbatim), absent with a name → `declared-proxy`, absent without a name →
 * `durable-id`.
 * @param {Object|null} record A FleetAgent record or same-keyed field bag (`displayName`,
 *     `agentId`, optional `nameProvenance`).
 * @returns {{text: String, isFallback: Boolean, provenance: {state: String, label: String, trail: (Object|null)}}}
 */
export function resolveNameSlot(record) {
    const
        displayName = typeof record?.displayName === 'string' && record.displayName.trim() !== '' ? record.displayName : null,
        agentId     = typeof record?.agentId === 'string' && record.agentId.trim() !== '' ? record.agentId : null,
        trail       = isPlainObject(record?.nameProvenance) ? record.nameProvenance : null;

    if (!displayName) {
        return {
            text      : agentId ?? '—',
            isFallback: true,
            provenance: {
                state: 'durable-id',
                label: agentId
                    ? 'Durable id — no display name declared; the id is the never-renamed anchor'
                    : 'No identity facts on this record',
                trail: null
            }
        }
    }

    if (trail) {
        return {
            text      : displayName,
            isFallback: false,
            provenance: {
                state: 'naming-layer',
                label: `Named "${displayName}" — naming-layer trail wired (display state over the durable id${agentId ? ` ${agentId}` : ''})`,
                trail
            }
        }
    }

    return {
        text      : displayName,
        isFallback: false,
        provenance: {
            state: 'declared-proxy',
            label: `"${displayName}" is declared display state over the durable id${agentId ? ` ${agentId}` : ''} — the naming-layer assent trail is not wired yet`,
            trail: null
        }
    }
}

/**
 * @summary The compact chip rendering for one provenance state — calibrated to the density
 * surface: a uniform signal carries no per-card information, so each state renders only what
 * differentiates it. `naming-layer` (trail wired — the future divergent state) earns the word
 * `named`; `declared-proxy` (today's uniform reality) renders a quiet outline glyph with the long
 * copy on title/aria; `durable-id` renders NO chip at all — the name slot's mono-id register IS
 * that signal, and a chip beside it would state the same fact twice.
 * @param {String} state One of {@link NAME_PROVENANCE_STATES}.
 * @returns {{cls: String[], hidden: Boolean, text: String}}
 */
export function describeNameProvenance(state) {
    return {
        cls   : ['fm-name-provenance', `is-${state}`],
        hidden: state === 'durable-id',
        text  : state === 'naming-layer' ? 'named' : state === 'declared-proxy' ? '◇' : ''
    }
}

/**
 * @summary Plain-object check (arrays and class instances are not trails).
 * @param {*} value
 * @returns {Boolean}
 * @private
 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
