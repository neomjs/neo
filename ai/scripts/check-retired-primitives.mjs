import {execFileSync} from 'node:child_process';
import path           from 'node:path';
import process        from 'node:process';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/check-retired-primitives.mjs`
 * matches sibling pattern of `ai/scripts/check-substrate-size.mjs` and
 * `ai/scripts/lint-skill-manifest.mjs` in `ai/scripts/`; all three are mechanical-enforcement /
 * CI scripts for agent substrate validation; §23 sibling-file-lift applies; no novel directory
 * choice.
 *
 * @summary CI grep-fail check that retired primitives (ADR 0004 §2.3) are not imported from
 * non-spec source files. Closes the empirical gap where the discipline-only
 * §1.3/§2.6/§5.6 substrate-evolution-guard layer in ADR 0004 caught the regression at peer-review
 * time on PR #11403 (Cycle-1), not at CI time. Pattern-recognition + mechanical-enforcement
 * together close the lookback-distance regression window.
 *
 * @see learn/agentos/decisions/0004-github-content-architecture.md §2.6 Clean-Cut Pattern
 * @see #11406 (ticket) / PR #11403 Cycle-1 (`PRR_kwDODSospM8AAAABAB3NsQ`) — empirical anchor
 */

/**
 * Retired primitives that MUST NOT be imported from non-spec source files.
 * Add new entries as ADR 0004 §2.3 RETIRED table grows. Each entry is the import-path
 * fragment as it would appear inside a `from '...'` clause.
 *
 * Empirically anchored to PR #11403's Lane B clean-cut: both files were deleted in commit
 * `79ac1f8c9` after their last call sites were rewired to the unified `contentPath.mjs` /
 * `contentIndex.mjs` substrate. The §2.6 Clean-Cut Pattern mandates DELETION, not preservation
 * as dead code (deprecation-theater regression caught on PR #11381 and recurring on PR #11403).
 */
const RETIRED_PRIMITIVES = [
    'shared/chunkPath.mjs',
    'shared/archivePath.mjs'
];

const SEARCH_ROOT  = 'ai/';
const EXCLUDE_GLOB = ['*.spec.mjs', '*.test.mjs'];

/**
 * Builds a single grep extended-regex pattern matching any `from '...<retired>'` style import,
 * tolerating single, double, or template-literal quoting. Escapes `.` inside path fragments so
 * `chunkPath.mjs` doesn't match `chunkPathXmjs`.
 * @returns {string}
 */
function buildPattern() {
    return RETIRED_PRIMITIVES
        .map(fragment => `from[[:space:]]+['"\`].*${fragment.replace(/\./g, '\\.')}`)
        .join('|');
}

/**
 * Runs the grep scan. Returns matching lines on hit, empty string on clean.
 * Distinguishes "no match" (exit 1) from real grep error (exit 2+).
 *
 * Uses execFileSync (no shell intermediate) so the pattern can contain all three quote types
 * (`'`, `"`, `\``) safely without shell-quoting hazards.
 *
 * @param {string} pattern Extended-regex pattern.
 * @returns {string}
 */
function runScan(pattern) {
    const args = [
        '-rnE',
        ...EXCLUDE_GLOB.map(g => `--exclude=${g}`),
        pattern,
        SEARCH_ROOT
    ];

    try {
        return execFileSync('grep', args, {encoding: 'utf8'});
    } catch (err) {
        if (err.status === 1) {
            // grep convention: exit 1 = zero matches (the CLEAN case).
            return '';
        }
        // exit 2+ = real grep error (bad pattern, unreadable file, etc.). Re-throw.
        throw err;
    }
}

function main() {
    if (RETIRED_PRIMITIVES.length === 0) {
        console.log('[checkRetiredPrimitives] PASS: RETIRED_PRIMITIVES table is empty — nothing to enforce.');
        process.exit(0);
    }

    const root    = path.resolve(process.cwd());
    const pattern = buildPattern();

    console.log(`\n🔍 Checking for retired-primitive imports under ${SEARCH_ROOT} ...`);
    console.log(`    Enforcing ${RETIRED_PRIMITIVES.length} retired primitive(s):`);
    RETIRED_PRIMITIVES.forEach(p => console.log(`      • ${p}`));
    console.log('-'.repeat(80));

    const matches = runScan(pattern);

    if (matches.trim() === '') {
        console.log(`✅ PASS: no retired-primitive imports found under ${SEARCH_ROOT}.`);
        console.log(`    Substrate is in compliance with ADR 0004 §2.6 Clean-Cut Pattern.\n`);
        process.exit(0);
    }

    console.error(`❌ FAIL: retired-primitive imports found under ${SEARCH_ROOT}:\n`);
    console.error(matches);
    console.error(`\nRoot: ${root}`);
    console.error(`Refer to ADR 0004 §2.6 (Clean-Cut Pattern) and §5.6 (Deprecation-theater anti-pattern):`);
    console.error(`  learn/agentos/decisions/0004-github-content-architecture.md`);
    console.error(`Retired primitives must be DELETED, not preserved as dead code after call-site migration.\n`);
    process.exit(1);
}

main();
