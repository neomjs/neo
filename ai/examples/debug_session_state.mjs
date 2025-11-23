import {
    Memory_SessionService,
    Memory_ChromaManager,
    Memory_Config
} from '../services.mjs';

async function debugSessionState() {
    console.log('🔍 Starting Session State Debugger...');

    // 1. Initialize
    console.log('⏳ Waiting for Memory Core readiness...');
    try {
        await Memory_ChromaManager.ready();
        await Memory_SessionService.ready();
        console.log('✅ Memory Core Services Ready.');
    } catch (e) {
        console.error('❌ Failed to initialize services:', e);
        process.exit(1);
    }

    // 2. Access Collections directly
    // The service exposes these as properties (getters)
    const memCol = Memory_SessionService.memoryCollection;
    const sumCol = Memory_SessionService.sessionsCollection;

    if (!memCol || !sumCol) {
        console.error('❌ Collections not initialized in SessionService.');
        process.exit(1);
    }

    console.log(`📂 Connected to collections: ${memCol.name}, ${sumCol.name}`);

    // 3. Scan Data (Replicating logic with logging)
    const includeAll = true; // Scan everything to be safe
    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    const minTimestamp = Date.now() - ONE_MONTH_MS;
    
    console.log(`
📊 Scanning Memories (Include All: ${includeAll})...`);
    
    const limit = 2000;
    let offset = 0;
    let allMemories = [];
    let hasMore = true;

    const memQuery = {
        include: ['metadatas'],
        limit
    };
    
    if (!includeAll) {
        memQuery.where = { timestamp: { '$gt': minTimestamp } };
    }

    while (hasMore) {
        memQuery.offset = offset;
        const batch = await memCol.get(memQuery);
        
        if (batch.ids.length === 0) {
            hasMore = false;
        } else {
            allMemories = allMemories.concat(batch.metadatas);
            offset += limit;
            process.stdout.write(`\r   Fetched ${allMemories.length} records...`);
            if (batch.ids.length < limit) hasMore = false;
        }
    }
    console.log(`\n   ✅ Total Memories Found: ${allMemories.length}`);

    // 4. Group Memories
    const sessions = {};
    allMemories.forEach(m => {
        if (!m.sessionId) return;
        if (!sessions[m.sessionId]) sessions[m.sessionId] = { count: 0, lastActive: m.timestamp };
        sessions[m.sessionId].count++;
        if (m.timestamp > sessions[m.sessionId].lastActive) sessions[m.sessionId].lastActive = m.timestamp;
    });

    const sessionIds = Object.keys(sessions);
    console.log(`   found ${sessionIds.length} unique sessions.`);

    // 5. Scan Summaries
    console.log(`
📊 Scanning Summaries...
`);
    
    offset = 0;
    hasMore = true;
    let allSummaries = [];
    const sumQuery = {
        include: ['metadatas'],
        limit
    };
    
    if (!includeAll) {
        sumQuery.where = { timestamp: { '$gt': minTimestamp } };
    }

    while (hasMore) {
        sumQuery.offset = offset;
        const batch = await sumCol.get(sumQuery);
        
        if (batch.ids.length === 0) {
            hasMore = false;
        } else {
            allSummaries = allSummaries.concat(batch.metadatas);
            offset += limit;
            process.stdout.write(`\r   Fetched ${allSummaries.length} records...`);
            if (batch.ids.length < limit) hasMore = false;
        }
    }
    console.log(`\n   ✅ Total Summaries Found: ${allSummaries.length}`);

    const summaryMap = {};
    allSummaries.forEach(m => {
        if (m.sessionId) summaryMap[m.sessionId] = m;
    });

    // 6. Compare and Diagnose
    console.log(`
🕵️  Diagnosing Session Status:`);
    console.log('------------------------------------------------------------------------------------------------------------------');
    console.log('| Session ID                           | Mem (DB) | Sum (DB) | Drift? | Status   | Last Active                 |');
    console.log('------------------------------------------------------------------------------------------------------------------');

    let candidates = 0;

    // Sort sessions by last active (newest first)
    sessionIds.sort((a, b) => new Date(sessions[b].lastActive) - new Date(sessions[a].lastActive));

    sessionIds.forEach(id => {
        const memCount = sessions[id].count;
        const sumData = summaryMap[id];
        const sumCount = sumData ? (sumData.memoryCount || 0) : 'N/A';
        const lastActive = sessions[id].lastActive;
        
        let status = '';
        let drift = false;

        if (sumCount === 'N/A') {
            status = 'MISSING SUMMARY';
            drift = true;
        } else if (memCount !== sumCount) {
            status = 'COUNT MISMATCH';
            drift = true;
        } else {
            status = 'SYNCED';
        }

        if (drift) candidates++;

        // Truncate ID for display if needed, or keep full
        const dispId = id.length > 36 ? id.substring(0, 33) + '...' : id.padEnd(36);
        
        // Safely handle lastActive display
        let activeDisplay = String(lastActive);
        if (typeof lastActive === 'number') {
            activeDisplay = new Date(lastActive).toISOString();
        }
        
        console.log(`| ${dispId} | ${String(memCount).padStart(8)} | ${String(sumCount).padStart(8)} | ${drift ? 'YES' : 'NO '} | ${status.padEnd(15)} | ${activeDisplay.padEnd(27)} |`);
    });
    console.log('------------------------------------------------------------------------------------------------------------------');
    console.log(`\nDiagnosis complete. Found ${candidates} sessions needing summarization.`);

    console.log(`\n🧪 Verifying Service Logic (Memory_SessionService.findSessionsToSummarize(false))...`);
    let serviceCandidates = [];
    try {
        serviceCandidates = await Memory_SessionService.findSessionsToSummarize(false);
        console.log(`   Service returned ${serviceCandidates.length} candidates:`, serviceCandidates);
        
        const missing = sessionIds.filter(id => {
             // Logic: if my diagnosis said it needs update (drift=true) but service didn't find it
             const memCount = sessions[id].count;
             const sumData = summaryMap[id];
             const sumCount = sumData ? (sumData.memoryCount || 0) : undefined;
             const needsUpdate = (sumCount === undefined || memCount !== sumCount);
             return needsUpdate && !serviceCandidates.includes(id);
        });

        if (missing.length > 0) {
            console.warn(`   ⚠️  Service MISSED these candidates:`, missing);
        } else {
            console.log(`   ✅ Service logic matches diagnosis.`);
        }

    } catch (e) {
        console.error('   ❌ Service call failed:', e);
    }

    if (serviceCandidates.length > 0) {
        console.log('\n🚀 Executing Summarization for Candidates...');
        for (const sessionId of serviceCandidates) {
             process.stdout.write(`   Summarizing ${sessionId}... `);
             try {
                 await Memory_SessionService.summarizeSession(sessionId);
                 console.log('✅ Done');
             } catch(err) {
                 console.log('❌ Failed', err.message);
             }
        }
        console.log('\n✨ Batch Summarization Complete.');
    }
    
    process.exit(0);
}

debugSessionState();
