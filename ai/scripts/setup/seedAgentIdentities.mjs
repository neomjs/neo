/**
 * Operational Context:
 * Explicit canonical projection tool. Run it once for initial Memory Core provisioning and again
 * after an intentional merged change to `identityRoots.mjs` (activation/status flip, naming fact,
 * or schema-backed capability update). The owning runtime checkout MUST pull the merged revision
 * before invoking this script; otherwise the operator would intentionally project stale registry
 * data. Ordinary GraphService boot is additive-only and never rewrites an existing identity.
 *
 * Re-seeding is idempotent and preserves the persisted `createdAt`. If identities disappeared
 * without an intentional registry change, investigate the upstream wipe (the historical hazard is
 * test-pollution via the :memory: override leak described in learn/agentos/IdentitySchema.md).
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
 * Idempotent re-run is safe: existing nodes preserve their original `createdAt` via the defensive
 * SQLite peek below; canonical properties update and runtime-added properties remain merged.
 *
 * Usage: node ai/scripts/setup/seedAgentIdentities.mjs
 */

import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {IDENTITIES}    from '../../graph/identityRoots.mjs';

const __filename = fileURLToPath(import.meta.url);

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
            // Defensive `createdAt` retention logic:
            // We peek directly at the raw SQLite `Nodes` table to check if the existing node has a `createdAt` timestamp.
            // This ensures an idempotent upsert without clobbering the creation-time provenance.
            // If `upsertNode` semantics ever change to 'preserve existing properties if not in update payload',
            // this manual peek could be refactored or removed.
            let hasCreatedAt = false;
            if (graphService.db?.storage) {
                const stmt = graphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?');
                const row  = stmt.get(identity.id);
                if (row && row.data) {
                    try {
                        const parsed = JSON.parse(row.data);
                        if (parsed.properties && parsed.properties.createdAt) {
                            hasCreatedAt = true;
                        }
                    } catch (e) {}
                }
            }

            const propertiesToUpdate = { ...identity.properties };
            if (hasCreatedAt) {
                delete propertiesToUpdate.createdAt;
            }

            const updatedIdentity = { ...identity, properties: propertiesToUpdate };
            graphService.upsertNode(updatedIdentity);
            log(`Updated AgentIdentity (${hasCreatedAt ? 'retained original' : 'added new'} createdAt): ${identity.id}`);
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
