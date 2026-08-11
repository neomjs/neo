/**
 * @summary Force-refetches the given issue numbers from GitHub to heal local drift.
 *
 * Companion to `detectTruncatedTimelines.mjs`. Intended pipeline:
 *
 *   node ai/scripts/diagnostics/detectTruncatedTimelines.mjs --json | node ai/scripts/migrations/refetchTruncatedIssues.mjs --stdin
 *
 * or explicit list:
 *
 *   node ai/scripts/migrations/refetchTruncatedIssues.mjs 10030 9486 9999
 *
 * Delegates to `GH_SyncService.refetchIssuesByNumber` which bypasses the delta-sync
 * `updatedAt` gate, exhausts full timelineItems pagination, and rewrites each local
 * markdown file. Safe to re-run: it is idempotent — refetching an already-current
 * issue is a no-op writeback.
 *
 * @see ai/scripts/diagnostics/detectTruncatedTimelines.mjs
 * @see ai/services/github-workflow/SyncService.mjs
 * @see https://github.com/neomjs/neo/issues/10090
 * @plane in-plane
 */
import {GH_SyncService} from '../../services.host.mjs';

function parseStdin() {
    return new Promise((resolve, reject) => {
        let raw = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', chunk => raw += chunk);
        process.stdin.on('end', () => {
            try {
                const parsed  = JSON.parse(raw);
                const primary = Array.isArray(parsed.primaryHits)     ? parsed.primaryHits     : [];
                const cap     = Array.isArray(parsed.capOnlySuspects) ? parsed.capOnlySuspects : [];
                resolve([...new Set([...primary, ...cap])]);
            } catch (e) {
                reject(new Error(`Failed to parse stdin as detector JSON: ${e.message}`));
            }
        });
        process.stdin.on('error', reject);
    });
}

async function main() {
    const argv = process.argv.slice(2);
    let numbers;

    if (argv.includes('--stdin')) {
        numbers = await parseStdin();
    } else {
        numbers = argv.map(a => Number(a)).filter(n => Number.isInteger(n) && n > 0);
    }

    if (numbers.length === 0) {
        console.error('Usage:');
        console.error('  node ai/scripts/migrations/refetchTruncatedIssues.mjs <num> [<num> ...]');
        console.error('  node ai/scripts/diagnostics/detectTruncatedTimelines.mjs --json | node ai/scripts/migrations/refetchTruncatedIssues.mjs --stdin');
        process.exit(1);
    }

    console.log(`Force-refetching ${numbers.length} issue(s): ${numbers.join(', ')}`);

    const stats = await GH_SyncService.refetchIssuesByNumber({numbers});

    console.log(`\nRefetched ${stats.refetched.count}/${numbers.length}`);
    if (stats.refetched.issues.length > 0) {
        console.log(`  OK: ${stats.refetched.issues.join(', ')}`);
    }
    if (stats.errors.length > 0) {
        console.log(`  FAIL: ${stats.errors.length} error(s)`);
        for (const {issueNumber, error} of stats.errors) {
            console.log(`    #${issueNumber}: ${error}`);
        }
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
