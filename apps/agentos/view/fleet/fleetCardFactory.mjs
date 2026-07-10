import {mapFleetSessionHealth} from './sourceHealth.mjs';

/**
 * @summary Fleet card-factory — transforms the Body-side fleet-cockpit DTO into per-card descriptors
 * for the workspace dock. This is the UPSTREAM half of the card-wall seam: it registers a stable
 * component ref per resident and emits a serializable creation blueprint; the dock owns arrangement,
 * perspectives, and the placement lifecycle. Two rules from the merged docking contract shape it:
 *
 * 1. It emits BLUEPRINTS, not live instances. Perspective-restore re-instantiates a card from its
 *    blueprint when no live instance exists, so a factory that only handed live instances would make a
 *    restored layout render placeholders instead of cards. The (componentRef, blueprint) pair IS the
 *    lifecycle contract — this upstream side needs no teardown protocol with the dock.
 * 2. The cards are layout-blind. This transform never reads or emits layout state; it maps identity +
 *    display data only, and the dock does the placing.
 *
 * Pure data-plane: no component import (the card is named by its serializable `ntype`; the dock's app
 * registers the AgentCard class), no live objects, JSON-serializable end-to-end.
 * @module apps/agentos/view/fleet/fleetCardFactory
 */

const AGENT_CARD_NTYPE = 'fm-agent-card';

const AGENT_CARD_POLICY = Object.freeze({closable: true, pinnable: true, movable: true});

/**
 * @summary Stable, durable-identity-keyed dock ref for a resident's card. Keyed on the `agentId` (never
 * presentation), so the dock resolves the SAME card across a rename / re-avatar / family swap.
 * @param {String} agentId
 * @returns {String}
 */
export function agentCardComponentRef(agentId) {
    return `fm-agent-card-${agentId}`
}

/**
 * @summary Map one fleet-cockpit DTO row to its dock card descriptor: a stable componentRef, a
 * serializable creation blueprint (the card's `ntype` + its `record` field bag — the same
 * {@link AgentOS.model.FleetAgent} field shape the store-backed cards render from, as a plain
 * snapshot), agent-card policy hints, and JSON identity metadata. Field mapping is null-safe and
 * forward-compatible — `engineTag`, `family`, and `laneLine` map through as `null` until the DTO
 * enrichment + activity/runtime wires land, with no change needed here. Source-health mapping is
 * shared with the Store-backed cockpit path so dock restore cannot silently regain placeholder-as-fact.
 * @param {Object} row=({}) A fleet-cockpit DTO row.
 * @returns {Object} `{componentRef, blueprint, policy, metadata}`
 */
export function toAgentCardDescriptor(row = {}) {
    const
        agentId       = row.id ?? null,
        sessionHealth = mapFleetSessionHealth(row.lifecycle, row.sources);

    return {
        componentRef: agentCardComponentRef(agentId),
        blueprint   : {
            ntype : AGENT_CARD_NTYPE,
            record: {
                agentId,
                avatarUrl  : row.avatarUrl ?? null,
                displayName: row.displayName ?? null,
                engineTag  : row.engineTag ?? null,
                family     : row.family ?? null,
                laneLine   : row.laneLine ?? null,
                sources    : sessionHealth.sources,
                state      : sessionHealth.state
            }
        },
        policy  : {...AGENT_CARD_POLICY},
        metadata: {
            agentId,
            githubUsername: row.githubUsername ?? null
        }
    }
}

/**
 * @summary Transform the fleet-cockpit DTO into the ordered set of dock card descriptors — one per
 * resident row — for the dock to place, restore, and reparent layout-blind AgentCards.
 * @param {Object} cockpitStatus=({}) The DTO from `createFleetCockpitStatus` (`{sources, capabilities, rows, events}`).
 * @returns {Object[]} One `{componentRef, blueprint, policy, metadata}` per row.
 */
export function createFleetCardDescriptors(cockpitStatus = {}) {
    const rows = Array.isArray(cockpitStatus.rows) ? cockpitStatus.rows : [];

    return rows.map(toAgentCardDescriptor)
}
