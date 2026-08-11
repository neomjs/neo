/**
 * @summary Force-refetches the given pull-request numbers from GitHub to heal local mirror drift.
 *
 * Pull-request analogue of `refetchTruncatedIssues.mjs`. PR mirrors are pull-only and the bulk sync
 * is delta-gated by `updatedAt`, so a closed/merged PR whose upstream body was edited (an edit that
 * does NOT bump `updatedAt`) is never re-pulled. This script bypasses that gate:
 *
 *   node ai/scripts/migrations/refetchStalePulls.mjs 13752 8152 9999
 *
 * Delegates to `GH_SyncService.refetchPullsByNumber`, which re-renders each local markdown file from
 * current GitHub state and persists updated metadata. Idempotent: refetching an already-current PR
 * is a no-op writeback.
 *
 * @see ai/scripts/migrations/refetchTruncatedIssues.mjs
 * @see ai/services/github-workflow/SyncService.mjs
 * @plane in-plane
 */
import {GH_SyncService} from '../../services.host.mjs';

async function main() {
    const argv    = process.argv.slice(2);
    const numbers = argv.map(a => Number(a)).filter(n => Number.isInteger(n) && n > 0);

    if (numbers.length === 0) {
        console.error('Usage:');
        console.error('  node ai/scripts/migrations/refetchStalePulls.mjs <num> [<num> ...]');
        process.exit(1);
    }

    console.log(`Force-refetching ${numbers.length} pull request(s): ${numbers.join(', ')}`);

    const stats = await GH_SyncService.refetchPullsByNumber({numbers});

    console.log(`\nRefetched ${stats.refetched.count}/${numbers.length}`);
    if (stats.refetched.pulls.length > 0) {
        console.log(`  OK: ${stats.refetched.pulls.join(', ')}`);
    }
    if (stats.errors.length > 0) {
        console.log(`  FAIL: ${stats.errors.length} error(s)`);
        for (const {prNumber, error} of stats.errors) {
            console.log(`    #${prNumber}: ${error}`);
        }
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
