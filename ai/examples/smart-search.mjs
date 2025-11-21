import { KB_QueryService, KB_HealthService, KB_LifecycleService, KB_DatabaseService, KB_ChromaManager } from '../services.mjs';

/**
 * Example: "Smart" Code Execution Script
 *
 * This script demonstrates the "Code Execution" pattern where an agent
 * imports the Neo.mjs AI SDK directly to query the knowledge base
 * and process results within the script context.
 *
 * Usage:
 * Run from the project root:
 * node ai/examples/smart-search.mjs
 */

async function main() {
    console.log('🤖 Agent: Initializing Knowledge Base SDK...');

    // Wait for the DB Lifecycle service to initialize (which starts the DB)
    console.log('⏳ Waiting for Database Lifecycle...');
    await KB_LifecycleService.ready();
    
    // Manual "Wait for DB" loop (since spawn !== ready)
    console.log('⏳ Waiting for ChromaDB heartbeat...');
    let connected = false;
    for (let i = 0; i < 20; i++) {
        try {
            await KB_ChromaManager.client.heartbeat();
            connected = true;
            break;
        } catch (e) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    if (!connected) {
        console.error('❌ ChromaDB failed to start.');
        process.exit(1);
    }
    console.log('✅ ChromaDB is responding.');

    // Trigger embedding manually to ensure collection exists
    // (In case the automatic init failed due to timing)
    console.log('⏳ Ensuring Knowledge Base is embedded...');
    try {
        await KB_DatabaseService.embedKnowledgeBase();
    } catch (e) {
        console.error('⚠️ Embedding failed (might be ready though):', e.message);
    }

    // 1. Verify System Health
    // This mimics an agent "checking its tools" before starting work.
    let health;
    for (let i = 0; i < 10; i++) {
        health = await KB_HealthService.healthcheck();
        if (health.status === 'healthy' || health.status === 'degraded') break;
        console.log(`⏳ Waiting for system health... (${health.status})`);
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`🏥 Health Status: ${health.status}`);

    if (health.status === 'unhealthy') {
        console.error('❌ System is unhealthy. Please start the database.');
        console.error('Details:', health.details);
        process.exit(1);
    }

    // 2. Execute a Query
    // The agent performs the search directly, saving a round-trip to the LLM.
    const query = 'how to use reactive configs';
    console.log(`🔍 Querying: "${query}"...`);

    try {
        const results = await KB_QueryService.queryDocuments({ query, type: 'guide' });

        if (results.results) {
            console.log(`✅ Found ${results.results.length} results.`);
            
            // 3. "Smart" Processing (The Code Execution Advantage)
            // Instead of dumping all results to the context, the agent can apply
            // custom logic to filter or rank them.
            
            const topResult = results.results[0];
            console.log('\n--- Top Result ---');
            console.log(`Source: ${topResult.source}`);
            console.log(`Score:  ${topResult.score}`);
            
            console.log('\n--- "Smart" Filter: Top 3 Guides ---');
            const topGuides = results.results
                .slice(0, 3)
                .map(r => `- ${r.source} (${r.score})`)
                .join('\n');
            console.log(topGuides);
            
        } else {
            console.log('⚠️ No results found.');
        }

    } catch (error) {
        console.error('❌ Query failed:', error.message);
    }
    
    // Explicit exit required because Neo.mjs creates persistent workers/intervals
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
