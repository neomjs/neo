import {test, expect} from '@playwright/test';
import {
    analyzeSubsystem,
    buildCoverageTimeline,
    buildReport,
    classifyBackup,
    extractBackupCounts,
    readArtifactSizes,
    readBackupEntries
} from '../../../../../../ai/scripts/maintenance/backupCorruptionTimeline.mjs';

/**
 * @summary Unit coverage for the artifact-verified backup-corruption timeline diagnostic.
 * Fixture-based — never touches a real backup dir or the live store. Covers the live incident shape:
 * a manifest claiming N memories while the actual memory JSONL artifact is empty (false-green).
 * @see ai/scripts/maintenance/backupCorruptionTimeline.mjs
 */

const claimMeta = (memories, chunks = 30000, graph = 100000) => ({
    completedAt: '2026-06-18T07:42:41Z',
    gitSha     : 'abc123',
    subsystems : {
        mc   : {message: `Export complete. Exported ${memories} memories, 1023 summaries, and 0 graph elements.`},
        kb   : {message: `Export complete. Exported ${chunks} knowledge base chunks.`},
        graph: {message: `Export complete. Exported 0 memories, 0 summaries, and ${graph} graph elements.`}
    }
});

// artifacts: bytes per ARTIFACT_SPECS key. The incident shape = mcMemory 0 bytes despite a positive claim.
const falseGreenArtifacts = {mcMemory: 0,      mcSummaries: 5622247, kb: 1688668103, graph: 72821271};
const verifiedArtifacts   = {mcMemory: 500000, mcSummaries: 5622247, kb: 1688668103, graph: 72821271};

test.describe('backupCorruptionTimeline — extractBackupCounts (manifest claim only)', () => {
    test('parses mc / kb / graph counts from a manifest', () => {
        const counts = extractBackupCounts(claimMeta(18835));

        expect(counts.mc).toEqual({memories: 18835, summaries: 1023});
        expect(counts.kb).toEqual({chunks: 30000});
        expect(counts.graph).toEqual({elements: 100000});
    });

    test('returns null for an absent or shapeless manifest', () => {
        expect(extractBackupCounts(null)).toBeNull();
        expect(extractBackupCounts({subsystems: {}})).toMatchObject({mc: null, kb: null, graph: null});
    });
});

test.describe('backupCorruptionTimeline — classifyBackup (artifact verification)', () => {
    test('THE incident shape: manifest claims 18835 memories but the artifact is 0 bytes → manifest-false-green, NOT clean', () => {
        const {status, subsystems} = classifyBackup({counts: extractBackupCounts(claimMeta(18835)), artifacts: falseGreenArtifacts});

        expect(subsystems.mcMemory).toMatchObject({claim: 18835, bytes: 0, verdict: 'false-green'});
        expect(status).toBe('manifest-false-green');
        expect(status).not.toBe('clean');
    });

    test('manifest claim + non-empty artifact → verified / clean', () => {
        const {status, subsystems} = classifyBackup({counts: extractBackupCounts(claimMeta(18835)), artifacts: verifiedArtifacts});

        expect(subsystems.mcMemory).toMatchObject({claim: 18835, bytes: 500000, verdict: 'verified'});
        expect(status).toBe('clean');
    });

    test('no manifest at all → export-failed (every subsystem no-manifest)', () => {
        const {status, subsystems} = classifyBackup({counts: null, artifacts: {}});

        expect(status).toBe('export-failed');
        expect(subsystems.mcMemory.verdict).toBe('no-manifest');
    });
});

test.describe('backupCorruptionTimeline — buildCoverageTimeline + analyzeSubsystem', () => {
    test('a series of manifest-false-green MC backups has zero verified-clean and no recoverable backup', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-18', meta: claimMeta(18835), artifacts: falseGreenArtifacts},
            {timestamp: '2026-05-27', meta: claimMeta(14520), artifacts: falseGreenArtifacts},
            {timestamp: '2026-06-20', meta: null,             artifacts: {}}
        ]);

        // sorted chronologically
        expect(timeline.map(r => r.timestamp)).toEqual(['2026-05-27', '2026-06-18', '2026-06-20']);
        expect(timeline[0].status).toBe('manifest-false-green');
        expect(timeline[2].status).toBe('export-failed');

        const mc = analyzeSubsystem(timeline, 'mcMemory');

        expect(mc.verifiedClean).toBe(0);
        expect(mc.falseGreen).toBe(2);
        expect(mc.noRecoverableBackup).toBe(true);
        expect(mc.falseGreenSpan).toEqual({from: '2026-05-27', to: '2026-06-18'});
        expect(mc.firstManifestAbsent).toBe('2026-06-20');
    });

    test('a verified-clean MC backup makes the series recoverable', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-18', meta: claimMeta(18835), artifacts: verifiedArtifacts}
        ]);

        const mc = analyzeSubsystem(timeline, 'mcMemory');

        expect(mc.verifiedClean).toBe(1);
        expect(mc.noRecoverableBackup).toBe(false);
        expect(mc.lastVerifiedClean).toBe('2026-06-18');
    });
});

test.describe('backupCorruptionTimeline — readArtifactSizes (injected fs)', () => {
    test('stats the per-subsystem artifact byte sizes; missing file → null', async () => {
        const fsModule = {
            pathExists: async dir => !dir.endsWith('/graph'),         // graph subdir missing
            readdir   : async dir => dir.endsWith('/mc') ? ['memory-backup-x.jsonl', 'summaries-backup-x.jsonl']
                                   : dir.endsWith('/kb') ? ['knowledge-base-backup-x.jsonl']
                                   : [],
            stat      : async p => ({size: p.includes('memory-backup') ? 0 : 4242})
        };

        const sizes = await readArtifactSizes({backupDir: '/b', fsModule});

        expect(sizes).toEqual({mcMemory: 0, mcSummaries: 4242, kb: 4242, graph: null});
    });
});

test.describe('backupCorruptionTimeline — readBackupEntries (injected fs)', () => {
    test('reads manifest + artifact sizes per backup; non-backup dirs filtered', async () => {
        const meta     = claimMeta(18835),
              fsModule = {
                  pathExists: async p => !p.endsWith('graph'),
                  readdir   : async dir => {
                      if (dir.endsWith('backups')) return ['backup-2026-06-18Z', 'not-a-backup'];
                      if (dir.endsWith('/mc'))     return ['memory-backup-x.jsonl'];
                      if (dir.endsWith('/kb'))     return ['knowledge-base-backup-x.jsonl'];
                      return []
                  },
                  readJson: async () => meta,
                  stat    : async p => ({size: p.includes('memory-backup') ? 0 : 999})
              };

        const entries = await readBackupEntries({backupsDir: '/x/backups', fsModule});

        expect(entries.map(e => e.timestamp)).toEqual(['2026-06-18Z']);
        expect(entries[0].meta).toEqual(meta);
        expect(entries[0].artifacts.mcMemory).toBe(0);
        expect(entries[0].artifacts.kb).toBe(999);
    });

    test('returns [] when the backups dir does not exist', async () => {
        const entries = await readBackupEntries({backupsDir: '/nope', fsModule: {pathExists: async () => false}});

        expect(entries).toEqual([]);
    });
});

test.describe('backupCorruptionTimeline — buildReport', () => {
    test('aggregates artifact-verified / false-green / export-failed totals + per-subsystem analysis', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-18', meta: claimMeta(18835), artifacts: falseGreenArtifacts},
            {timestamp: '2026-06-20', meta: null,             artifacts: {}}
        ]);

        const report = buildReport(timeline, '/backups');

        expect(report.totalBackups).toBe(2);
        expect(report.artifactVerifiedClean).toBe(0);
        expect(report.manifestFalseGreen).toBe(1);
        expect(report.exportFailed).toBe(1);
        expect(report.perSubsystem.mcMemory.noRecoverableBackup).toBe(true);
    });
});
