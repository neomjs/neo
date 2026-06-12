#!/usr/bin/env node
/**
 * @summary One-shot migration script that patches legacy bridge-daemon wake subscriptions
 * to eliminate hardcoded fallbacks and adopt the identity template-based metadata.
 *
 * Legacy `bridge-daemon` wake subscriptions can contain hardcoded `appName`
 * fallbacks when their metadata was not seeded from the owning identity. This
 * script updates existing `WAKE_SUBSCRIPTION` nodes by pulling the canonical
 * `appName` from their owner's `AgentIdentity` template.
 *
 * **Usage**:
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs             # dry-run (default)
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --apply     # commit the migration
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --db <path> # override SQLite path
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --help      # print usage
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRoot    = path.resolve(__dirname, '../..');

function parseArgs(argv) {
    const args = {apply: false, db: null, help: false};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply')       args.apply = true;
        else if (a === '--help')   args.help = true;
        else if (a === '--db')     args.db = argv[++i];
        else {
            console.error(`Unknown argument: ${a}`);
            args.help = true;
        }
    }
    return args;
}

function printUsage() {
    console.log(`
Usage: node ai/scripts/migrations/migrateWakeSubscriptions.mjs [options]

Options:
  (no flags)     Dry-run mode — print the migration plan without committing
  --apply        Commit the migration atomically in a single transaction
  --db <path>    Override SQLite file path (default: .neo-ai-data/sqlite/memory-core-graph.sqlite)
  --help         Print this usage message
`);
}

function runMigration(db, apply) {
    const stats = {
        subscriptionsPatched: 0,
        subscriptionsSkipped: 0
    };

    const work = () => {
        // Find all WAKE_SUBSCRIPTION nodes
        const subs = db.prepare(`SELECT id, data FROM Nodes WHERE json_extract(data, '$.label') = ?`).all('WAKE_SUBSCRIPTION');

        for (const sub of subs) {
            let data;
            try {
                data = JSON.parse(sub.data);
            } catch (e) {
                console.warn(`  [SKIP] Invalid JSON in subscription ${sub.id}`);
                stats.subscriptionsSkipped++;
                continue;
            }

            const props = data.properties || {};
            if (props.harnessTarget !== 'bridge-daemon') {
                stats.subscriptionsSkipped++;
                continue;
            }

            const agentId = props.agentIdentity;
            if (!agentId) {
                stats.subscriptionsSkipped++;
                continue;
            }

            // Get owner AgentIdentity
            const agentRow = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(agentId);
            if (!agentRow) {
                console.warn(`  [SKIP] Owner ${agentId} missing for subscription ${sub.id}`);
                stats.subscriptionsSkipped++;
                continue;
            }

            let agentData;
            try {
                agentData = JSON.parse(agentRow.data);
            } catch (e) {
                stats.subscriptionsSkipped++;
                continue;
            }

            const template = agentData.properties?.subscriptionTemplate;
            if (!template || !template.harnessTargetMetadata || !template.harnessTargetMetadata.appName) {
                stats.subscriptionsSkipped++;
                continue;
            }

            const expectedAppName = template.harnessTargetMetadata.appName;
            const expectedTabShortcut = template.harnessTargetMetadata.tabShortcut;
            const currentMetadata = props.harnessTargetMetadata || {};

            if (currentMetadata.appName !== expectedAppName || currentMetadata.tabShortcut !== expectedTabShortcut) {
                console.log(`  [PATCH] Subscription ${sub.id} (Owner: ${agentId}) | appName: ${currentMetadata.appName || 'none'} → ${expectedAppName}, tabShortcut: ${currentMetadata.tabShortcut !== undefined ? currentMetadata.tabShortcut : 'none'} → ${expectedTabShortcut !== undefined ? expectedTabShortcut : 'none'}`);

                if (apply) {
                    props.harnessTargetMetadata = {
                        ...currentMetadata,
                        appName: expectedAppName,
                        tabShortcut: expectedTabShortcut
                    };
                    data.properties = props;

                    db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(data), sub.id);
                }
                stats.subscriptionsPatched++;
            } else {
                stats.subscriptionsSkipped++;
            }
        }
    };

    if (apply) {
        const transaction = db.transaction(work);
        transaction();
    } else {
        work();
    }

    return stats;
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printUsage();
        process.exit(0);
    }

    const dbPath = args.db || path.resolve(neoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');
    console.log(`[migrateWakeSubscriptions] target: ${dbPath}`);
    console.log(`[migrateWakeSubscriptions] mode:   ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log();

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, {verbose: null});

    try {
        const stats = runMigration(db, args.apply);

        console.log();
        console.log(`[migrateWakeSubscriptions] summary:`);
        console.log(`  subscriptions patched: ${stats.subscriptionsPatched}`);
        console.log(`  subscriptions skipped: ${stats.subscriptionsSkipped}`);

        if (!args.apply) {
            console.log();
            console.log(`[migrateWakeSubscriptions] DRY-RUN complete. No changes applied.`);
            console.log(`[migrateWakeSubscriptions] Re-run with --apply to commit.`);
        } else {
            console.log();
            console.log(`[migrateWakeSubscriptions] APPLY complete. Migration committed.`);
        }
    } finally {
        db.close();
    }
}

main().catch(err => {
    console.error('[migrateWakeSubscriptions] FATAL:', err);
    process.exit(1);
});
