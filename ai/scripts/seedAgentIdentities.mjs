/**
 * @summary Seeds initial AgentIdentity nodes into the Neo.mjs Memory Core Native Graph.
 * These nodes represent persistent identities for human owners and model agents.
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
            // Fetch raw SQLite node to check if createdAt exists
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
