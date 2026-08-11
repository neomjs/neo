/**
 * @summary One-time, non-destructive re-bucket migration for the issue archive.
 *
 * Relocates mis-bucketed issue markdown into the correct release folders using the current bucketing
 * logic + the FULL release history, then rewrites the issues `_index.json`. This corrects historical
 * mis-bucketing — notably the v8.1.0 catch-all created before full-release-history fetching existed,
 * where pre-window closed issues collapsed into the oldest in-window release. The normal sync leaves
 * these PINNED (sealed-chunk + `oldVersion` precedence); this migration deliberately re-buckets them.
 *
 * Non-destructive: it relocates existing `.md` files (no delete, no GitHub re-fetch) using a two-phase
 * staged move so files swapping chunks cannot collide. Scope: issues only (the dominant pile-up).
 *
 *   node ai/scripts/migrations/rebucketArchive.mjs --dry-run   # preview the redistribution
 *   node ai/scripts/migrations/rebucketArchive.mjs             # execute the moves + save metadata
 *
 * After executing: regenerate the portal index (`buildScripts/docs/index/tickets.mjs`) and run the
 * concurrency-capped SSR regen + deploy so the portal tickets view reflects the corrected buckets.
 *
 * @see ai/services/github-workflow/sync/IssueSyncer.mjs (migrateArchiveBuckets)
 * @see ai/services/github-workflow/SyncService.mjs (facade)
 * @plane in-plane
 */
import {GH_SyncService} from '../../services.host.mjs';

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log(`${dryRun ? '[DRY RUN] ' : ''}Re-bucketing the issue archive (full release history + corrected logic)...`);
    const result = await GH_SyncService.migrateArchiveBuckets({dryRun});

    const versions = Object.entries(result.byVersion).sort((a, b) => b[1] - a[1]);
    console.log('\nResulting distribution by version (count, descending):');
    for (const [version, count] of versions) {
        console.log(`  ${version.padEnd(16)} ${count}`);
    }

    console.log(`\n${dryRun ? 'Would move' : 'Moved'}: ${dryRun ? result.moves.length : result.moved}  ·  unchanged: ${result.unchanged}`);

    if (dryRun) {
        console.log('\nDry run — no files moved, metadata untouched. Re-run without --dry-run to execute.');
    } else {
        console.log('\nDone. Next: regenerate the portal index + run the concurrency-capped SSR regen + deploy.');
    }
}

main().catch(e => {
    console.error('Re-bucket migration failed:', e);
    process.exit(1);
});
