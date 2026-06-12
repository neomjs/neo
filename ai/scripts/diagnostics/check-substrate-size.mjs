import fs from 'fs';
import path from 'path';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/diagnostics/check-substrate-size.mjs`
 * matches sibling pattern of `ai/scripts/lint/lint-skill-manifest.mjs` in `ai/scripts/`;
 * both are mechanical enforcement / CI scripts for agent substrate validation;
 * sibling-file-lift applies; no novel directory choice.
 */

const ROOT_DIR = path.resolve(process.cwd());

// Per-file budget limit for Antigravity memory files (24 KiB hard limit).
const PER_FILE_LIMIT_BYTES = 24576;

// The surfaces that Antigravity injects globally on every turn.
const TARGET_FILES = [
    'AGENTS.md',
    '.agents/ANTIGRAVITY_RULES.md'
];

let hasError = false;

console.log(`\n🔍 Checking Antigravity Substrate sizes against ${PER_FILE_LIMIT_BYTES} byte per-file limit...`);
console.log('--------------------------------------------------------------------------------');

TARGET_FILES.forEach(file => {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Error: Required substrate file ${file} not found.`);
        hasError = true;
        return;
    }

    const stats = fs.statSync(fullPath);
    const size = stats.size;
    const status = size > PER_FILE_LIMIT_BYTES ? '❌ EXCEEDS' : '✅ PASS';

    console.log(`📄 ${file.padEnd(30)} : ${size} bytes [${status}]`);

    if (size > PER_FILE_LIMIT_BYTES) {
        hasError = true;
    }
});

console.log('--------------------------------------------------------------------------------');

if (hasError) {
    console.error(`\n❌ Substrate Size Check FAILED!`);
    console.error(`One or more files exceed the Antigravity hard limit of ${PER_FILE_LIMIT_BYTES} bytes per file.`);
    console.error(`If this passes, the bottom of the offending file will be silently truncated and agents will lose critical memory.\n`);
    console.error(`Please reduce the size of the tracked memory files by migrating granular instructions to .agents/skills/ Atlas files (Progressive Disclosure).`);
    process.exit(1);
}

console.log(`\n✅ Substrate Size Check PASSED. All files safely under the ${PER_FILE_LIMIT_BYTES} byte limit.\n`);
process.exit(0);
