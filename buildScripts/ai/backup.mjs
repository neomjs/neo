import fs               from 'fs-extra';
import path             from 'path';
import {fileURLToPath}  from 'url';

import {
    KB_DatabaseService,
    KB_LifecycleService,
    Memory_DatabaseService,
    Memory_LifecycleService
} from '../../ai/services.mjs';

/**
 * @module buildScripts/ai/backup
 * @summary Canonical atomic-bundle backup orchestrator for the Neo.mjs AI substrate.
 *
 * Produces a timestamped, self-contained snapshot covering every persistent subsystem:
 *
 * ```
 * .neo-ai-data/backups/backup-<ISO-timestamp>/
 * ├── kb/                 # Knowledge Base ChromaDB as JSONL
 * ├── mc/                 # Memory Core memories + summaries as JSONL
 * ├── graph/              # Memory Core SQLite graph as JSONL
 * ├── concepts/           # Concept Ontology JSONL (nodes, edges)
 * └── trajectories/       # RLAIF training trajectories JSONL
 * ```
 *
 * Peer architecture per #10129 Phase 3: this script does NOT defrag — it captures the
 * current state whatever shape it is in. `defragChromaDB.mjs` retains its private pre-nuke
 * helper and does not call this orchestrator. Operators who want compacted backups chain
 * commands at the shell layer: `npm run ai:defrag-kb && npm run ai:backup`.
 *
 * All service calls route through `ai/services.mjs`, which applies Zod validation at the
 * SDK boundary via `makeSafe()` — no direct `ai/mcp/server/...` imports.
 *
 * ## Retention Policy (TODO)
 *
 * Semantics to mirror `defragChromaDB.cleanOldBackups` but applied to the unified bundle tree:
 * - Keep the newest `K` bundles unconditionally (default `K = 3`)
 * - Delete additional bundles older than `N` days (default `N = 7`)
 * - Sweep runs at the directory level on `.neo-ai-data/backups/` — one timestamp = one decision
 *   (no more correlating JSONL filenames across roots)
 *
 * **Not implemented in this commit** — the substrate is now in place, but the sweep itself
 * is a follow-up once operator habits around `npm run ai:backup` have stabilized and we
 * know the realistic cadence. Until then: manual pruning is fine, bundles are cheap to keep.
 *
 * ## Legacy Backup Migration
 *
 * The pre-#10129 layout co-exists with the new bundle tree and is **not touched** by this script:
 *
 * - Flat JSONL at `.neo-ai-data/backups/` root (`memory-backup-*.jsonl`, `summaries-backup-*.jsonl`,
 *   `graph-backup-*.jsonl`) — preserved as-is for archive / restore use. New bundles land in
 *   `backup-<ISO-ts>/` subfolders alongside them.
 * - Physical-copy directories at `dist/chromadb-backups/<target>/backup-<numeric-ts>/` — these
 *   remain **defrag-exclusive pre-nuke snapshots** (see `defragChromaDB.mjs` Phase 3 peer
 *   architecture note). They are orthogonal to this script's output.
 *
 * Operators who want to reclaim space can manually delete the legacy flat files or run
 * `defragChromaDB.cleanOldBackups` against `dist/chromadb-backups/<target>/`. No automated
 * migration is provided — the archives are cheap and the manual decision is low-risk.
 *
 * @see buildScripts/ai/defragChromaDB.mjs
 * @see https://github.com/neomjs/neo/issues/10129
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_CONCEPTS_DIR      = path.join(PROJECT_ROOT, '.neo-ai-data', 'concepts');
const DEFAULT_TRAJECTORIES_FILE = path.join(PROJECT_ROOT, '.neo-ai-data', 'datasets', 'rlaif', 'trajectories.jsonl');
const DEFAULT_BACKUP_ROOT       = path.join(PROJECT_ROOT, '.neo-ai-data', 'backups');

/**
 * Executes a full-substrate backup.
 *
 * @param {Object}   options
 * @param {String}  [options.bundleRoot=null]            Absolute bundle path. If null, a timestamped dir under the default root is used.
 * @param {String}  [options.conceptsSourceDir]          Override for the Concept Ontology source directory.
 * @param {String}  [options.trajectoriesSourceFile]     Override for the RLAIF trajectories source file.
 * @param {Object}  [options.logger=console]             Log sink; useful for tests.
 * @returns {Promise<{bundleRoot: String, timestamp: String, subsystems: Object}>}
 */
export async function runBackup({
    bundleRoot             = null,
    conceptsSourceDir      = DEFAULT_CONCEPTS_DIR,
    trajectoriesSourceFile = DEFAULT_TRAJECTORIES_FILE,
    logger                 = console
} = {}) {
    const timestamp    = new Date().toISOString().replace(/:/g, '-');
    const resolvedRoot = bundleRoot ?? path.join(DEFAULT_BACKUP_ROOT, `backup-${timestamp}`);

    const layout = {
        kb          : path.join(resolvedRoot, 'kb'),
        mc          : path.join(resolvedRoot, 'mc'),
        graph       : path.join(resolvedRoot, 'graph'),
        concepts    : path.join(resolvedRoot, 'concepts'),
        trajectories: path.join(resolvedRoot, 'trajectories')
    };

    await Promise.all(Object.values(layout).map(dir => fs.ensureDir(dir)));

    await Promise.all([
        KB_LifecycleService.ready(),
        Memory_LifecycleService.ready()
    ]);

    const subsystems = {};

    logger.log('[1/5] Exporting Knowledge Base...');
    subsystems.kb = await KB_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        backupPath: layout.kb
    });

    logger.log('[2/5] Exporting Memory Core (memories + summaries)...');
    subsystems.mc = await Memory_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        include   : ['memories', 'summaries'],
        backupPath: layout.mc
    });

    logger.log('[3/5] Exporting Memory Core graph...');
    subsystems.graph = await Memory_DatabaseService.manageDatabaseBackup({
        action    : 'export',
        include   : ['graph'],
        backupPath: layout.graph
    });

    logger.log('[4/5] Copying Concept Ontology...');
    subsystems.concepts = await copyJsonlSource(conceptsSourceDir, layout.concepts);

    logger.log('[5/5] Copying RLAIF trajectories...');
    subsystems.trajectories = await copyJsonlSource(trajectoriesSourceFile, layout.trajectories);

    logger.log('[6/6] Applying retention sweep...');
    await cleanOldBackups(DEFAULT_BACKUP_ROOT, logger);

    logger.log(`✅ Backup complete: ${resolvedRoot}`);
    return {bundleRoot: resolvedRoot, timestamp, subsystems};
}

/**
 * Applies retention policy to the backup root.
 * Keeps the newest K=3 bundles unconditionally.
 * Deletes older bundles if they are older than N=7 days.
 * @param {String} backupRoot
 * @param {Object} logger
 */
async function cleanOldBackups(backupRoot, logger) {
    if (!await fs.pathExists(backupRoot)) return;

    const entries = await fs.readdir(backupRoot, { withFileTypes: true });
    
    const backups = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;
        
        const tsMatch = entry.name.match(/^backup-(.+)$/);
        if (!tsMatch) continue;
        
        const rawTs = tsMatch[1];
        const isoTime = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
        const date = new Date(isoTime);
        
        if (!isNaN(date.getTime())) {
            backups.push({
                name: entry.name,
                path: path.join(backupRoot, entry.name),
                date: date,
                time: date.getTime()
            });
        }
    }

    backups.sort((a, b) => b.time - a.time);

    const K = 3;
    const N_DAYS = 7;
    const now = Date.now();
    const thresholdMs = N_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    
    for (let i = K; i < backups.length; i++) {
        const backup = backups[i];
        const ageMs = now - backup.time;
        if (ageMs > thresholdMs) {
            logger.log(`[Retention] Deleting old backup: ${backup.name} (age: ${Math.round(ageMs / 86400000)} days)`);
            await fs.remove(backup.path);
            deletedCount++;
        }
    }
    
    if (deletedCount > 0) {
        logger.log(`[Retention] Removed ${deletedCount} old backup(s).`);
    }
}

/**
 * Copies JSONL data from a source (either a directory of JSONL files or a single JSONL file)
 * into the destination directory. Missing sources are reported, not fatal — concepts and
 * trajectories may legitimately not exist in fresh environments.
 *
 * @param {String} source  Absolute path to a JSONL file or a directory containing JSONL files.
 * @param {String} destDir Absolute path to the target subfolder inside the bundle.
 * @returns {Promise<{copied: Number, note?: String}>}
 */
async function copyJsonlSource(source, destDir) {
    if (!await fs.pathExists(source)) {
        return {copied: 0, note: `source not present: ${source}`};
    }

    const stat = await fs.stat(source);

    if (stat.isDirectory()) {
        const entries    = await fs.readdir(source);
        const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));

        await Promise.all(jsonlFiles.map(f =>
            fs.copy(path.join(source, f), path.join(destDir, f))
        ));

        return {copied: jsonlFiles.length};
    }

    await fs.copy(source, path.join(destDir, path.basename(source)));
    return {copied: 1};
}

// Auto-run when invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runBackup()
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Backup failed:', error);
            process.exit(1);
        });
}
