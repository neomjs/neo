/**
 * Operational Context:
 * Explicit canonical projection tool. Run it once for initial Memory Core provisioning and again
 * after an intentional merged change to `identityRoots.mjs` (activation/status flip, naming fact,
 * or schema-backed capability update). The owning runtime checkout MUST pull the merged revision
 * before invoking this script; otherwise the operator would intentionally project stale registry
 * data. Ordinary GraphService boot is additive-only and never rewrites an existing identity.
 *
 * Re-seeding is idempotent. **The registry is authoritative for `createdAt`** — `identityRoots.mjs`
 * declares it "an immutable, hardcoded resident/root-introduction fact", so a registry entry that
 * carries one is projected over a divergent node value. Only when the registry is silent is the
 * node's existing stamp carried forward. This direction is load-bearing: while the projection ran
 * the other way, a wrong identity age was permanently unfixable — the registry called the field
 * immutable and the only writer that could enforce that was built to refuse it.
 *
 * If identities disappeared without an intentional registry change, investigate the upstream wipe
 * (the historical hazard is test-pollution via the :memory: override leak described in
 * learn/agentos/IdentitySchema.md).
 *
 * @summary Seeds initial system, AgentIdentity, and BroadcastSentinel nodes into the Neo.mjs Memory Core Native Graph.
 *
 * These nodes form the **addressable identity surface** for the A2A Mailbox substrate:
 * the lifecycle system sender (`@system`), human owners (`@tobiu`), model-backed agents
 * (`@neo-opus-ada`, `@neo-gemini-pro`), and the `AGENT:*` broadcast sentinel that carries
 * fan-out `SENT_TO` edges emitted by {@link Neo.ai.services.memory-core.MailboxService#addMessage}
 * for broadcast traffic.
 *
 * **Why the broadcast sentinel needs to be a real graph node:** `GraphService.linkNodes`
 * enforces an FK-style guard that culls edges whose endpoints aren't present in the Nodes table.
 * The guard is correct defense-in-depth against hallucinated LLM-generated edges but wrongly
 * dropped every broadcast `SENT_TO` edge while this sentinel was merely a sentinel string. Seeding
 * it as a real node satisfies the guard without relaxing it for other edge-creation paths.
 *
 * **Apoptosis Exemption:**
 * Agent root nodes are natively protected from the `DreamService` Phase 4 Garbage Collection (Apoptosis) mechanism.
 * The apoptosis process actively prunes "orphaned nodes" (nodes with zero edges) to prevent unbound
 * graph growth, but `AgentIdentity` and `BroadcastSentinel` are explicitly exempted in `GraphService.getOrphanedNodes`
 * to prevent silent wipes during idle or fresh Memory Core states prior to their first activity edges.
 *
 * Idempotent re-run is safe: canonical properties update, runtime-added properties remain merged,
 * and `createdAt` resolves to the registry's declared value — falling back to the node's persisted
 * stamp only for entries the registry does not describe.
 *
 * Usage: node ai/scripts/setup/seedAgentIdentities.mjs
 * @plane in-plane
 */

import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {IDENTITIES}    from '../../graph/identityRoots.mjs';

const __filename = fileURLToPath(import.meta.url);

/**
 * @summary Read one node's persisted `properties.createdAt` straight from the raw SQLite `Nodes`
 * row, bypassing the in-memory projection.
 *
 * Reads storage rather than `getNode()` because the caller needs the *stored* stamp specifically:
 * it is deciding whether the registry's declared value differs from what is durably on disk, and a
 * projected read would answer a subtly different question. Returns `null` whenever storage is
 * absent, the row is missing, or the payload does not parse — every one of which means "no stored
 * stamp to fall back on", never "blank the field".
 *
 * @param {Object} graphService The GraphService whose storage to peek.
 * @param {String} id The node id.
 * @returns {String|null} The persisted ISO timestamp, or null when none is readable.
 */
function readStoredCreatedAt(graphService, id) {
    if (!graphService.db?.storage) {
        return null
    }

    const row = graphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);

    if (!row?.data) {
        return null
    }

    try {
        return JSON.parse(row.data)?.properties?.createdAt || null
    } catch (e) {
        return null
    }
}

/**
 * @summary Intentionally project the current canonical identity registry into one Memory Core
 * graph while preserving each existing root's original creation provenance.
 * @param {Object} [options]
 * @param {Object} [options.graphService] Injectable GraphService; defaults lazily to the configured
 * Memory Core service so importing this module in a unit test never mounts production storage.
 * @param {Object[]} [options.identities=IDENTITIES] Registry entries to project.
 * @param {Function} [options.log=console.log] Progress sink.
 * @returns {Promise<Number>} Number of identity roots processed.
 */
export async function seedAgentIdentities({graphService, identities = IDENTITIES, log = console.log} = {}) {
    if (!graphService) {
        ({Memory_GraphService: graphService} = await import('../../services.mjs'));
    }

    log('Awaiting Memory Graph Service readiness...');
    await graphService.ready();

    log('Seeding Agent Identities...');
    let seededCount = 0;

    for (const identity of identities) {
        const existing = graphService.getNode({id: identity.id});

        if (!existing) {
            graphService.upsertNode(identity);
            log(`Created AgentIdentity: ${identity.id}`);
        } else {
            // `createdAt` authority: the REGISTRY wins. `identityRoots.mjs` declares the
            // field "an immutable, hardcoded resident/root-introduction fact", so an entry that
            // carries one is projected over whatever the node holds — that reconciliation is this
            // script's entire purpose, and refusing it is what made a wrong identity age permanent.
            // The raw-SQLite peek survives, inverted: it now supplies a fallback for entries the
            // registry does NOT describe, so a silent registry never blanks a persisted stamp.
            const propertiesToUpdate = {...identity.properties},
                  stored             = readStoredCreatedAt(graphService, identity.id);

            // Provenance is tracked rather than inferred from the resulting value: after the
            // fallback fires, a truthy `createdAt` no longer implies the registry supplied it, and
            // a log that guessed from truthiness would report `from registry` for a stamp the
            // registry never declared. An operator reading this line is auditing exactly that.
            let reconciled = null,
                source     = 'absent';

            if (propertiesToUpdate.createdAt) {
                source = 'from registry';

                if (stored && stored !== propertiesToUpdate.createdAt) {
                    reconciled = stored;
                }
            } else if (stored) {
                propertiesToUpdate.createdAt = stored;
                source                       = 'from stored fallback (registry silent)';
            }

            const updatedIdentity = {...identity, properties: propertiesToUpdate};
            graphService.upsertNode(updatedIdentity);
            log(
                reconciled
                    ? `Updated AgentIdentity (createdAt RECONCILED ${reconciled} -> ${propertiesToUpdate.createdAt}): ${identity.id}`
                    : `Updated AgentIdentity (createdAt ${source}): ${identity.id}`
            );
        }
        seededCount++;
    }

    log(`Successfully processed ${seededCount} identities in the native graph.`);

    return seededCount;
}

/**
 * @summary Run the explicit projection as a one-shot CLI and preserve its historical process exit.
 * @returns {Promise<void>}
 */
async function main() {
    await seedAgentIdentities();
    process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('Failed to seed AgentIdentities:', err);
        process.exit(1);
    });
}
