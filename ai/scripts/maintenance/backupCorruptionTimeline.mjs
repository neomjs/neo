import {program}                      from 'commander';
import fs                             from 'fs-extra';
import path                           from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import Neo                            from '../../../src/Neo.mjs';

/**
 * @summary Read-only backup-corruption timeline diagnostic.
 *
 * Walks `.neo-ai-data/backups/backup-*&#47;bundle-meta.json`, extracts each backup's fail-loud
 * per-collection export counts, and reports a chronological coverage timeline plus the
 * corruption-onset window — the transition from the last clean export to the first failed export
 * (a failed/partial export leaves no `bundle-meta.json`), and any monotonicity regression (an
 * append-mostly collection's count dropping between consecutive clean backups = data loss).
 *
 * This is a HISTORICAL/forensic complement to `checkChromaIntegrity.mjs` (the live-store probe):
 * it dates *when* a corruption first appeared from the backup series, instead of only reporting
 * current coverage. It NEVER contacts the live Chroma daemon or mutates anything — backups only.
 *
 * Empirically: this walk pinned the Memory Core vector-loss incident to 2026-06-18→06-20 (the last
 * clean MC export was 18,835 memories on 06-18; the 06-20 backup was the first failed export).
 *
 * Usage:
 *   node ai/scripts/maintenance/backupCorruptionTimeline.mjs
 *   node ai/scripts/maintenance/backupCorruptionTimeline.mjs --json
 *   node ai/scripts/maintenance/backupCorruptionTimeline.mjs --backups /path/to/backups
 *
 * @module ai.scripts.maintenance.backupCorruptionTimeline
 * @see ai/scripts/maintenance/checkChromaIntegrity.mjs
 * @see learn/agentos/tooling/RestorationRunbook.md
 * @see https://github.com/neomjs/neo/issues/14024
 */
void Neo;

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const neoRootDir = path.resolve(__dirname, '../../../');

/**
 * @summary Default backups directory (the layout `backup.mjs` writes; verified during live-store triage).
 * @type {String}
 */
export const DEFAULT_BACKUPS_DIR = path.resolve(neoRootDir, '.neo-ai-data/backups');

/**
 * @summary Parses a backup `bundle-meta.json` into per-collection export counts.
 *
 * A successful backup carries a fail-loud export message per subsystem; an absent/partial manifest
 * (a failed export never completes the bundle) yields `null` — itself the corruption signal.
 *
 * @param {Object|null} meta Parsed `bundle-meta.json`, or null when the manifest is missing.
 * @returns {Object|null} `{mc, kb, graph, completedAt, gitSha}` (each collection `null` when unparsable), or `null` when `meta` is absent/shapeless.
 */
export function extractBackupCounts(meta) {
    if (!meta || typeof meta !== 'object' || !meta.subsystems) {
        return null
    }

    const s          = meta.subsystems,
          mcMatch    = /Exported\s+(\d+)\s+memories(?:,\s+(\d+)\s+summaries)?/.exec(s.mc?.message || ''),
          kbMatch    = /Exported\s+(\d+)\s+knowledge base chunks/.exec(s.kb?.message || ''),
          graphMatch = /(\d+)\s+graph elements/.exec(s.graph?.message || '');

    return {
        mc         : mcMatch    ? {memories: Number(mcMatch[1]), summaries: mcMatch[2] ? Number(mcMatch[2]) : null} : null,
        kb         : kbMatch     ? {chunks: Number(kbMatch[1])} : null,
        graph      : graphMatch  ? {elements: Number(graphMatch[1])} : null,
        completedAt: meta.completedAt || null,
        gitSha     : meta.gitSha     || null
    }
}

/**
 * @summary Builds a chronologically-sorted coverage timeline from backup entries.
 *
 * @param {Array<{timestamp: String, meta: (Object|null)}>} entries One per backup dir.
 * @returns {Array<{timestamp: String, status: ('clean'|'export-failed'), counts: (Object|null)}>}
 */
export function buildCoverageTimeline(entries = []) {
    return [...entries]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map(entry => {
            const counts = extractBackupCounts(entry.meta);

            return {
                timestamp: entry.timestamp,
                status   : counts ? 'clean' : 'export-failed',
                counts
            }
        })
}

/**
 * @summary Detects the corruption-onset window for one collection's count series.
 *
 * Two independent signals: (1) the first `clean → export-failed` transition (the export stopped
 * completing); (2) a count DROP between consecutive clean backups — append-mostly collections
 * (Memory Core memories/sessions) should be monotonic, so a decrease is itself data loss.
 *
 * @param {Array<Object>} timeline Rows from {@link buildCoverageTimeline}.
 * @param {Function}      countOf  `(row) => Number|null|undefined` — the collection's count from a row.
 * @returns {{onsetWindow: ({lastClean: String, firstDegraded: String}|null), drop: ({from: Number, to: Number, fromAt: String, at: String}|null)}}
 */
export function detectCorruptionOnset(timeline = [], countOf) {
    let lastClean = null, onsetWindow = null, drop = null, prevCount = null, prevTs = null;

    for (const row of timeline) {
        const count = row.status === 'clean' ? countOf(row) : null;

        if (count == null) {
            if (lastClean && !onsetWindow) {
                onsetWindow = {lastClean, firstDegraded: row.timestamp}
            }
            continue
        }

        if (prevCount != null && count < prevCount && !drop) {
            drop = {from: prevCount, to: count, fromAt: prevTs, at: row.timestamp}
        }

        lastClean = row.timestamp;
        prevCount = count;
        prevTs    = row.timestamp
    }

    return {onsetWindow, drop}
}

/**
 * @summary Reads every `backup-*&#47;bundle-meta.json` under the backups dir into timeline entries.
 *
 * @param {Object}   options
 * @param {String}   options.backupsDir   Directory holding `backup-<ISO>` snapshot dirs.
 * @param {Object}   [options.fsModule=fs] Filesystem seam (test injection).
 * @returns {Promise<Array<{timestamp: String, meta: (Object|null)}>>}
 */
export async function readBackupEntries({backupsDir, fsModule = fs} = {}) {
    if (!backupsDir || !await fsModule.pathExists(backupsDir)) {
        return []
    }

    const dirs    = (await fsModule.readdir(backupsDir)).filter(name => name.startsWith('backup-')),
          entries = [];

    for (const dir of dirs) {
        const metaPath = path.join(backupsDir, dir, 'bundle-meta.json');
        let   meta     = null;

        if (await fsModule.pathExists(metaPath)) {
            try {
                meta = await fsModule.readJson(metaPath)
            } catch {
                meta = null // unreadable/corrupt manifest reads as a failed export
            }
        }

        entries.push({timestamp: dir.replace(/^backup-/, ''), meta})
    }

    return entries
}

/**
 * @summary Assembles the full report object (pure; the CLI renders or JSON-prints it).
 * @param {Array<Object>} timeline Rows from {@link buildCoverageTimeline}.
 * @param {String}        backupsDir
 * @returns {Object}
 */
export function buildReport(timeline, backupsDir) {
    return {
        backupsDir,
        totalBackups: timeline.length,
        cleanBackups: timeline.filter(r => r.status === 'clean').length,
        onset       : {
            mc   : detectCorruptionOnset(timeline, r => r.counts?.mc?.memories),
            kb   : detectCorruptionOnset(timeline, r => r.counts?.kb?.chunks),
            graph: detectCorruptionOnset(timeline, r => r.counts?.graph?.elements)
        },
        timeline
    }
}

/**
 * @summary Renders the report as a human-readable table + onset summary.
 * @param {Object} report From {@link buildReport}.
 * @returns {String}
 */
export function formatReport(report) {
    const lines = [
        `Backup-corruption timeline — ${report.backupsDir}`,
        `${report.totalBackups} backups (${report.cleanBackups} clean, ${report.totalBackups - report.cleanBackups} export-failed)`,
        '',
        'DATE                     | STATUS        | MC mem | KB chunks | graph',
        '-------------------------|---------------|--------|-----------|------'
    ];

    for (const row of report.timeline) {
        const mc    = row.counts?.mc?.memories ?? '—',
              kb    = row.counts?.kb?.chunks   ?? '—',
              graph = row.counts?.graph?.elements ?? '—';

        lines.push(`${row.timestamp.padEnd(24)} | ${row.status.padEnd(13)} | ${String(mc).padStart(6)} | ${String(kb).padStart(9)} | ${graph}`)
    }

    lines.push('');

    for (const [name, {onsetWindow, drop}] of Object.entries(report.onset)) {
        if (onsetWindow) {
            lines.push(`⚠️  ${name}: corruption onset window ${onsetWindow.lastClean} (last clean) → ${onsetWindow.firstDegraded} (first export-failed)`)
        }
        if (drop) {
            lines.push(`⚠️  ${name}: count regression ${drop.from} → ${drop.to} between ${drop.fromAt} and ${drop.at} (append-mostly collection should not shrink)`)
        }
        if (!onsetWindow && !drop) {
            lines.push(`✅ ${name}: no onset window or regression detected across the backup series`)
        }
    }

    return lines.join('\n')
}

async function main() {
    program
        .option('--backups <dir>', 'Backups directory to scan', DEFAULT_BACKUPS_DIR)
        .option('--json', 'Emit JSON instead of the human table', false)
        .parse();

    const opts     = program.opts(),
          entries  = await readBackupEntries({backupsDir: opts.backups}),
          timeline = buildCoverageTimeline(entries),
          report   = buildReport(timeline, opts.backups);

    process.stdout.write((opts.json ? JSON.stringify(report, null, 2) : formatReport(report)) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
