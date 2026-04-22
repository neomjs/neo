/**
 * @summary Seeds initial AgentIdentity + BroadcastSentinel nodes into the Neo.mjs Memory Core Native Graph.
 *
 * These nodes form the **addressable identity surface** for the A2A Mailbox substrate (#10139):
 * human owners (`@tobiu`), model-backed agents (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`), and the
 * `AGENT:*` broadcast sentinel that carries fan-out `SENT_TO` edges emitted by
 * {@link Neo.ai.mcp.server.memory-core.services.MailboxService#addMessage} for broadcast traffic.
 *
 * **Why the broadcast sentinel needs to be a real graph node (#10174):** `GraphService.linkNodes`
 * enforces an FK-style guard that culls edges whose endpoints aren't present in the Nodes table.
 * The guard is correct defense-in-depth against hallucinated LLM-generated edges but wrongly
 * dropped every broadcast `SENT_TO` edge while this sentinel was merely a sentinel string. Seeding
 * it as a real node satisfies the guard without relaxing it for other edge-creation paths.
 *
 * Idempotent re-run is safe: existing nodes preserve their original `createdAt` via the defensive
 * SQLite peek below; new properties merge on top.
 *
 * Usage: node ai/scripts/seedAgentIdentities.mjs
 */

import { Memory_GraphService } from '../services.mjs';

const IDENTITIES = [
    {
        id: '@neo-opus-4-7',
        type: 'AgentIdentity',
        name: 'Claude Opus 4.7',
        description: 'Anthropic Claude Opus version 4.7 Agent Identity',
        properties: {
            githubLogin: '@neo-opus-4-7',
            displayName: 'Claude Opus 4.7',
            modelFamily: 'claude',
            accountType: 'agent',
            createdAt: new Date().toISOString()
        }
    },
    {
        id: '@neo-gemini-3-1-pro',
        type: 'AgentIdentity',
        name: 'Gemini 3.1 Pro',
        description: 'Google Gemini 3.1 Pro Agent Identity',
        properties: {
            githubLogin: '@neo-gemini-3-1-pro',
            displayName: 'Gemini 3.1 Pro',
            modelFamily: 'gemini',
            accountType: 'agent',
            createdAt: new Date().toISOString()
        }
    },
    {
        id: '@tobiu',
        type: 'AgentIdentity',
        name: 'Tobias Uhlig',
        description: 'Human Owner',
        properties: {
            githubLogin: '@tobiu',
            displayName: 'Tobias Uhlig',
            modelFamily: null,
            accountType: 'human',
            createdAt: new Date().toISOString()
        }
    },
    {
        id: 'AGENT:*',
        type: 'BroadcastSentinel',
        name: 'Broadcast',
        description: 'Mailbox broadcast sentinel. `SENT_TO` edges targeting this node fan out to all authenticated recipients per MailboxService.listMessages visibility rules. Must exist as a real graph node so GraphService.linkNodes FK-style guard does not cull broadcast edges — see #10174.',
        properties: {
            githubLogin: null,
            displayName: 'Broadcast',
            modelFamily: null,
            accountType: 'sentinel',
            createdAt: new Date().toISOString()
        }
    }
];

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
