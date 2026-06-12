/**
 * Operational Context:
 * Idempotent recovery tool. In healthy operation, this script runs exactly once — at initial Memory
 * Core provisioning — and the seeded nodes persist for the lifetime of the graph. If you find yourself
 * needing to re-run it, something upstream wiped the AgentIdentity nodes; the known hazard is
 * test-pollution via the :memory: override leak in MailboxService.spec.mjs / PermissionService.spec.mjs
 * (see "Test pollution hazard" section in learn/agentos/IdentitySchema.md). Re-seeding is safe —
 * existing createdAt is preserved — but the upstream cause should be fixed rather than masked.
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
 * SQLite peek below; new properties merge on top.
 *
 * Usage: node ai/scripts/setup/seedAgentIdentities.mjs
 */

import { Memory_GraphService } from '../../services.mjs';
import { IDENTITIES }          from '../../graph/identityRoots.mjs';

async function seed() {
    console.log('Bootstrapping Memory Graph Service...');
    await Memory_GraphService.initAsync();

    console.log('Seeding Agent Identities...');
    let seededCount = 0;

    for (const identity of IDENTITIES) {
        const existing = Memory_GraphService.getNode({ id: identity.id });

        if (!existing) {
            Memory_GraphService.upsertNode(identity);
            console.log(`Created AgentIdentity: ${identity.id}`);
        } else {
            // Defensive `createdAt` retention logic:
            // We peek directly at the raw SQLite `Nodes` table to check if the existing node has a `createdAt` timestamp.
            // This ensures an idempotent upsert without clobbering the creation-time provenance.
            // If `upsertNode` semantics ever change to 'preserve existing properties if not in update payload',
            // this manual peek could be refactored or removed.
            let hasCreatedAt = false;
            if (Memory_GraphService.db && Memory_GraphService.db.storage) {
                const stmt = Memory_GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?');
                const row = stmt.get(identity.id);
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
            Memory_GraphService.upsertNode(updatedIdentity);
            console.log(`Updated AgentIdentity (${hasCreatedAt ? 'retained original' : 'added new'} createdAt): ${identity.id}`);
        }
        seededCount++;
    }

    console.log(`Successfully processed ${seededCount} identities in the native graph.`);
    process.exit(0);
}

seed().catch(err => {
    console.error('Failed to seed AgentIdentities:', err);
    process.exit(1);
});
