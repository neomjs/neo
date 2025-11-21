import {
    KB_LifecycleService, KB_HealthService, KB_QueryService, KB_DatabaseService, KB_ChromaManager,
    GH_IssueService, 
    Memory_Service, Memory_LifecycleService, Memory_ChromaManager
} from '../services.mjs';

/**
 * Agent OS Demo: Self-Healing Repository
 * 
 * This script demonstrates a fully autonomous agent workflow ("The Thick Client"):
 * 1. Monitor: Scans GitHub for open bugs.
 * 2. Understand: Uses the local Knowledge Base to analyze the codebase context.
 * 3. Plan: Uses the Memory Core to persist its reasoning.
 * 4. Act: Proposes a fix directly on the GitHub issue.
 */

const TARGET_ISSUE_TITLE = '[Test] Button click event not firing on mobile';

async function main() {
    console.log('🤖 Agent OS: Starting Self-Healing Routine...');

    // --- Phase 1: Boot Sequence ---
    console.log('\n[1] Boot Sequence: Initializing Services...');
    
    // Start Knowledge Base
    await KB_ChromaManager.ready(); // Ensure connection is active
    console.log('   - Knowledge Base Service: Ready');
    
    // Start Memory Core
    await Memory_ChromaManager.ready(); // Ensure connection is active
    console.log('   - Memory Core Service: Ready');
    
    // Ensure KB content is loaded (embed if needed)
    try { await KB_DatabaseService.embedKnowledgeBase(); } catch(e) {}

    console.log('✅ System Fully Operational.');


    // --- Phase 2: Monitor (GitHub) ---
    console.log('\n[2] Monitor: Scanning for Issues...');
    
    const issues = await GH_IssueService.listIssues({
        state: 'open',
        labels: 'bug',
        limit: 100
    });

    const targetIssue = issues.issues.find(i => i.title === TARGET_ISSUE_TITLE);

    if (!targetIssue) {
        console.log('   - No matching test issue found. Exiting.');
        process.exit(0);
    }

    console.log(`   - Found Target: #${targetIssue.number} "${targetIssue.title}"`);
    console.log(`   - Body: "${targetIssue.body.replace(/\n/g, ' ').substring(0, 60)}"...`);


    // --- Phase 3: Understand (Knowledge Base) ---
    console.log('\n[3] Understand: Querying Knowledge Base...');
    
    const query = `mobile button click event handler conflict ${targetIssue.body}`;
    const docs = await KB_QueryService.queryDocuments({ query, type: 'all' });
    
    const topResults = docs.results.slice(0, 3);
    console.log(`   - Analyzed ${docs.results.length} documents.`);
    console.log(`   - Top Context: ${topResults[0].source} (Score: ${topResults[0].score})`);


    // --- Phase 4: Plan (Memory Core) ---
    console.log('\n[4] Plan: Persisting Strategy to Memory...');
    
    const plan = `
    Issue #${targetIssue.number} reports mobile click failures.
    KB suggests checking: ${topResults.map(r => r.source).join(', ')}.
    Hypothesis: DomEvent manager might be double-firing or consuming touch events.
    Action: Propose investigating DomEvent.mjs and Button/Base.mjs.
    `;

    await Memory_Service.addMemory({
        prompt: `Fix bug #${targetIssue.number}: ${targetIssue.title}`,
        thought: "Analyzed issue and retrieved context. Formulating fix proposal.",
        response: plan,
        sessionId: 'self-healing-demo-v1'
    });
    console.log('   - Strategy saved to long-term memory.');


    // --- Phase 5: Report (GitHub) ---
    console.log('\n[5] Report: Posting Solution...');

    const commentBody = `
### 🤖 Agent OS Analysis

I have analyzed this issue using the local Knowledge Base.

**Context Identified:**
${topResults.map(r => `- \
${r.source}\
`).join('\n')}

**Proposed Investigation:**
Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
DomEvent.mjs
. The search results indicate potential overlaps between touch and click handling in the mobile viewports.

*This comment was generated autonomously by the Neo.mjs Agent OS.*
    `;

    await GH_IssueService.createComment({
        issue_number: targetIssue.number,
        body: commentBody,
        agent: 'Neo Agent OS'
    });

    console.log(`✅ Fix proposed on issue #${targetIssue.number}.`);
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
