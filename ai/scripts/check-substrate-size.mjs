import fs from 'fs';
import path from 'path';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/check-substrate-size.mjs` 
 * matches sibling pattern of `ai/scripts/lint-skill-manifest.mjs` in `ai/scripts/`; 
 * both are mechanical enforcement / CI scripts for agent substrate validation; 
 * §23 sibling-file-lift applies; no novel directory choice.
 */

const ROOT_DIR = path.resolve(process.cwd());

// Combined budget limit for all injected Antigravity memory files.
const COMBINED_LIMIT_BYTES = 24000;

// The surfaces that Antigravity injects globally on every turn.
const TARGET_FILES = [
    'AGENTS.md',
    '.agents/ANTIGRAVITY_RULES.md'
];

// Budget allocation (for descriptive failure messages)
const BUDGET = {
    'AGENTS.md': 20000,
    '.agents/ANTIGRAVITY_RULES.md': 3700,
    'App Data Envelope (e.g. GEMINI.md + Harness overhead)': 300
};

let totalBytes = 0;

console.log(`\n🔍 Checking Antigravity Substrate combined size against ${COMBINED_LIMIT_BYTES} byte limit...`);
console.log('--------------------------------------------------------------------------------');

TARGET_FILES.forEach(file => {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Error: Required substrate file ${file} not found.`);
        process.exit(1);
    }
    
    const stats = fs.statSync(fullPath);
    totalBytes += stats.size;
    console.log(`📄 ${file.padEnd(30)} : ${stats.size} bytes`);
});

// Assume 300 bytes of overhead for the harness envelope (GEMINI.md, injection headers, etc.)
const EXPECTED_OVERHEAD = BUDGET['App Data Envelope (e.g. GEMINI.md + Harness overhead)'];
totalBytes += EXPECTED_OVERHEAD;

console.log(`📦 Envelope Overhead (estimated)  : ${EXPECTED_OVERHEAD} bytes`);
console.log('--------------------------------------------------------------------------------');
console.log(`Σ Total Projected Payload Size    : ${totalBytes} bytes`);

if (totalBytes > COMBINED_LIMIT_BYTES) {
    console.error(`\n❌ Substrate Size Check FAILED!`);
    console.error(`The combined injected payload size (${totalBytes} bytes) exceeds the Antigravity hard limit of ${COMBINED_LIMIT_BYTES} bytes.`);
    console.error(`If this passes, the bottom of AGENTS.md (Escalation Ladder, Skills, etc.) will be silently truncated and agents will lose critical memory.\n`);
    console.error(`Budget guidelines:`);
    Object.entries(BUDGET).forEach(([key, val]) => {
        console.error(`  - ${key}: ~${val} bytes`);
    });
    console.error(`\nPlease reduce the size of the tracked memory files by migrating granular instructions to .agents/skills/ Atlas files (Progressive Disclosure).`);
    process.exit(1);
}

console.log(`\n✅ Substrate Size Check PASSED. Safely under the ${COMBINED_LIMIT_BYTES} byte limit.\n`);
process.exit(0);
