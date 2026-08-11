/**
 * @plane in-plane
 */
import {program}                      from 'commander';
import fs                             from 'fs-extra';
import path                           from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import Neo                            from '../../../src/Neo.mjs';

/**
 * @summary Read-only backup-corruption timeline diagnostic — artifact-verified, not manifest-trusted.
 *
 * Walks `.neo-ai-data/backups/backup-*&#47;`, and for each backup compares the `bundle-meta.json`
 * CLAIM (per-subsystem export counts) against the actual exported JSONL ARTIFACT (its byte size).
 * A manifest is treated as ONE signal, never as proof of a recoverable backup: a backup whose
 * manifest claims `N > 0` records while the matching artifact is 0 bytes / missing is classified
 * `manifest-false-green`, NOT `clean`. The output exposes both the manifest count and the artifact
 * byte size so the operator sees any disagreement. It NEVER contacts the live Chroma daemon or
 * mutates anything — backups only.
 *
 * Why byte-size, not row-count: artifacts reach multiple GB (the KB JSONL is ~1.6GB), so reading
 * them to count rows is infeasible; and the JSONL is not reliably one-record-per-line (a summaries
 * artifact had 103 newlines for 5.6MB). `stat` byte-size is O(1), scalable, and unambiguous for the
 * empty-artifact false-green this incident produced. A non-empty artifact is reported as
 * artifact-present (`clean`); strict per-record parity is out of scope here.
 *
 * Empirically: every retained Memory Core MEMORY artifact (`mc/memory-backup-*.jsonl`) is 0 bytes
 * from 2026-05-27 through 2026-06-18 despite manifests claiming 14,520→18,835 memories — i.e. there
 * is NO artifact-verified-clean MC-memory backup in the retained series; the manifests are
 * false-green. The first manifest-absent backup (06-20) marks when fail-loud export landed, NOT the
 * corruption onset.
 *
 * Usage:
 *   node ai/scripts/maintenance/backupCorruptionTimeline.mjs
 *   node ai/scripts/maintenance/backupCorruptionTimeline.mjs --json
 *   node ai/scripts/maintenance/backupCorruptionTimeline.mjs --backups /path/to/backups
 *
 * @module ai.scripts.maintenance.backupCorruptionTimeline
 * @see ai/scripts/maintenance/checkChromaIntegrity.mjs
 * @see learn/agentos/tooling/RestorationRunbook.md
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
 * @summary Per-subsystem artifact specs: which backup subdir + filename prefix holds the JSONL whose
 * presence verifies the manifest claim. `manifestCount` maps the spec to its `extractBackupCounts` value.
 * @type {Array<{key: String, subdir: String, prefix: String, manifestCount: Function, label: String}>}
 */
export const ARTIFACT_SPECS = [
    {key: 'mcMemory',    subdir: 'mc',    prefix: 'memory-backup-',         label: 'MC memories',  manifestCount: c => c?.mc?.memories},
    {key: 'mcSummaries', subdir: 'mc',    prefix: 'summaries-backup-',      label: 'MC summaries', manifestCount: c => c?.mc?.summaries},
    {key: 'kb',          subdir: 'kb',    prefix: 'knowledge-base-backup-', label: 'KB chunks',    manifestCount: c => c?.kb?.chunks},
    {key: 'graph',       subdir: 'graph', prefix: 'graph-backup-',          label: 'graph',        manifestCount: c => c?.graph?.elements}
];

/**
 * @summary Parses a backup `bundle-meta.json` into per-collection export counts (the CLAIM only).
 *
 * The manifest is one signal; its count is NOT proof of a recoverable artifact (pre-fail-loud
 * exports logged success by source count while writing a 0-byte artifact). Verification happens in
 * {@link classifyBackup} against the artifact byte size.
 *
 * @param {Object|null} meta Parsed `bundle-meta.json`, or null when the manifest is missing.
 * @returns {Object|null} `{mc, kb, graph, completedAt, gitSha}`, or `null` when `meta` is absent/shapeless.
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
 * @summary Stats the exported artifact byte sizes for one backup dir (one per {@link ARTIFACT_SPECS}).
 *
 * @param {Object} options
 * @param {String} options.backupDir   Absolute path to the `backup-<ISO>` dir.
 * @param {Object} [options.fsModule=fs] Filesystem seam (test injection: `readdir`, `stat`, `pathExists`).
 * @returns {Promise<Object>} `{[key]: (Number|null)}` — artifact byte size, or `null` when missing.
 */
export async function readArtifactSizes({backupDir, fsModule = fs} = {}) {
    const sizes = {};

    for (const spec of ARTIFACT_SPECS) {
        const subdir = path.join(backupDir, spec.subdir);
        let   bytes  = null;

        if (await fsModule.pathExists(subdir)) {
            const file = (await fsModule.readdir(subdir)).find(name => name.startsWith(spec.prefix) && name.endsWith('.jsonl'));

            if (file) {
                bytes = (await fsModule.stat(path.join(subdir, file))).size
            }
        }

        sizes[spec.key] = bytes
    }

    return sizes
}

/**
 * @summary Classifies one backup by comparing each subsystem's manifest claim to its artifact bytes.
 *
 * Per subsystem: `verified` (claim > 0 AND artifact bytes > 0), `false-green` (claim > 0 AND artifact
 * 0-bytes/missing), `no-claim` (manifest present, no count), `no-manifest` (no manifest at all). The
 * overall row status is the headline MC-memory verdict, since the recoverability question is
 * MC-memory-centric (the live incident's axis); per-subsystem detail is preserved.
 *
 * @param {Object}      options
 * @param {Object|null} options.counts    From {@link extractBackupCounts}.
 * @param {Object}      options.artifacts From {@link readArtifactSizes}.
 * @returns {{status: String, subsystems: Object}}
 */
export function classifyBackup({counts, artifacts = {}} = {}) {
    const subsystems = {};

    for (const spec of ARTIFACT_SPECS) {
        const claim = counts ? spec.manifestCount(counts) : null,
              bytes = artifacts[spec.key] ?? null;
        let   verdict;

        if (!counts) {
            verdict = 'no-manifest'
        } else if (claim == null) {
            verdict = 'no-claim'
        } else if (claim > 0 && (bytes == null || bytes === 0)) {
            verdict = 'false-green'
        } else if (claim > 0 && bytes > 0) {
            verdict = 'verified'
        } else {
            verdict = 'empty-claim' // claim === 0
        }

        subsystems[spec.key] = {claim, bytes, verdict}
    }

    const mc     = subsystems.mcMemory.verdict;
    const status = !counts ? 'export-failed'
        : mc === 'false-green' ? 'manifest-false-green'
        : mc === 'verified'    ? 'clean'
        : 'no-mc-claim';

    return {status, subsystems}
}

/**
 * @summary Builds a chronologically-sorted, artifact-verified coverage timeline.
 *
 * @param {Array<{timestamp: String, meta: (Object|null), artifacts: Object}>} entries One per backup dir.
 * @returns {Array<{timestamp: String, status: String, counts: (Object|null), subsystems: Object}>}
 */
export function buildCoverageTimeline(entries = []) {
    return [...entries]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map(entry => {
            const counts               = extractBackupCounts(entry.meta),
                  {status, subsystems} = classifyBackup({counts, artifacts: entry.artifacts || {}});

            return {timestamp: entry.timestamp, status, counts, subsystems}
        })
}

/**
 * @summary Per-subsystem analysis over the verified timeline.
 *
 * Reports verified-clean vs false-green counts, the last artifact-verified-clean backup, the
 * false-green span (first→last manifest-claimed-but-empty), and the first manifest-absent backup.
 * A subsystem with zero verified-clean backups has NO recoverable retained backup.
 *
 * @param {Array<Object>} timeline From {@link buildCoverageTimeline}.
 * @param {String}        specKey  An {@link ARTIFACT_SPECS} `key`.
 * @returns {Object}
 */
export function analyzeSubsystem(timeline = [], specKey) {
    let verifiedClean     = 0, falseGreen = 0, manifestAbsent = 0,
        lastVerifiedClean = null, firstFalseGreen = null, lastFalseGreen = null, firstManifestAbsent = null;

    for (const row of timeline) {
        const v = row.subsystems?.[specKey]?.verdict;

        if (v === 'verified') {
            verifiedClean++;
            lastVerifiedClean = row.timestamp
        } else if (v === 'false-green') {
            falseGreen++;
            firstFalseGreen ??= row.timestamp;
            lastFalseGreen = row.timestamp
        } else if (v === 'no-manifest') {
            manifestAbsent++;
            firstManifestAbsent ??= row.timestamp
        }
    }

    return {
        verifiedClean,
        falseGreen,
        manifestAbsent,
        lastVerifiedClean,
        falseGreenSpan     : firstFalseGreen ? {from: firstFalseGreen, to: lastFalseGreen} : null,
        firstManifestAbsent,
        noRecoverableBackup: verifiedClean === 0
    }
}

/**
 * @summary Reads each backup dir's manifest + artifact sizes into timeline entries.
 *
 * @param {Object}   options
 * @param {String}   options.backupsDir   Directory holding `backup-<ISO>` snapshot dirs.
 * @param {Object}   [options.fsModule=fs] Filesystem seam (test injection).
 * @returns {Promise<Array<{timestamp: String, meta: (Object|null), artifacts: Object}>>}
 */
export async function readBackupEntries({backupsDir, fsModule = fs} = {}) {
    if (!backupsDir || !await fsModule.pathExists(backupsDir)) {
        return []
    }

    const dirs    = (await fsModule.readdir(backupsDir)).filter(name => name.startsWith('backup-')),
          entries = [];

    for (const dir of dirs) {
        const backupDir = path.join(backupsDir, dir),
              metaPath  = path.join(backupDir, 'bundle-meta.json');
        let meta = null;

        if (await fsModule.pathExists(metaPath)) {
            try {
                meta = await fsModule.readJson(metaPath)
            } catch {
                meta = null // unreadable/corrupt manifest reads as a failed export
            }
        }

        const artifacts = await readArtifactSizes({backupDir, fsModule});

        entries.push({timestamp: dir.replace(/^backup-/, ''), meta, artifacts})
    }

    return entries
}

/**
 * @summary Assembles the full report object (pure; the CLI renders or JSON-prints it).
 * @param {Array<Object>} timeline From {@link buildCoverageTimeline}.
 * @param {String}        backupsDir
 * @returns {Object}
 */
export function buildReport(timeline, backupsDir) {
    const perSubsystem = {};

    for (const spec of ARTIFACT_SPECS) {
        perSubsystem[spec.key] = analyzeSubsystem(timeline, spec.key)
    }

    return {
        backupsDir,
        totalBackups         : timeline.length,
        artifactVerifiedClean: timeline.filter(r => r.status === 'clean').length,
        manifestFalseGreen   : timeline.filter(r => r.status === 'manifest-false-green').length,
        exportFailed         : timeline.filter(r => r.status === 'export-failed').length,
        perSubsystem,
        timeline
    }
}

/**
 * @summary Renders the report as a human table (manifest claim vs artifact bytes) + per-subsystem verdict.
 * @param {Object} report From {@link buildReport}.
 * @returns {String}
 */
export function formatReport(report) {
    const lines = [
        `Backup-corruption timeline (artifact-verified) — ${report.backupsDir}`,
        `${report.totalBackups} backups: ${report.artifactVerifiedClean} artifact-verified-clean, ${report.manifestFalseGreen} manifest-false-green, ${report.exportFailed} export-failed`,
        '',
        'DATE                     | STATUS               | MC mem claim → bytes',
        '-------------------------|----------------------|---------------------'
    ];

    for (const row of report.timeline) {
        const mc    = row.subsystems?.mcMemory,
              claim = mc?.claim ?? '—',
              bytes = mc?.bytes == null ? '—' : mc.bytes;

        lines.push(`${row.timestamp.padEnd(24)} | ${row.status.padEnd(20)} | ${String(claim).padStart(7)} → ${bytes}`)
    }

    lines.push('');

    for (const spec of ARTIFACT_SPECS) {
        const a = report.perSubsystem[spec.key];

        if (a.noRecoverableBackup && a.falseGreen > 0) {
            lines.push(`⛔ ${spec.label}: NO artifact-verified-clean backup retained — ${a.falseGreen} manifest-false-green (claim>0, 0-byte artifact)${a.falseGreenSpan ? ` spanning ${a.falseGreenSpan.from} → ${a.falseGreenSpan.to}` : ''}. Backup-based recovery is NOT possible from the retained series.`)
        } else if (a.falseGreen > 0) {
            lines.push(`⚠️  ${spec.label}: ${a.verifiedClean} verified-clean, ${a.falseGreen} false-green; last verified-clean ${a.lastVerifiedClean || 'none'}.`)
        } else if (a.verifiedClean > 0) {
            lines.push(`✅ ${spec.label}: ${a.verifiedClean} artifact-verified-clean; last ${a.lastVerifiedClean}.`)
        } else {
            lines.push(`• ${spec.label}: no manifest claims in the retained series.`)
        }

        if (a.firstManifestAbsent) {
            lines.push(`   (first manifest-absent backup ${a.firstManifestAbsent} = when fail-loud export landed, not necessarily the corruption onset.)`)
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
