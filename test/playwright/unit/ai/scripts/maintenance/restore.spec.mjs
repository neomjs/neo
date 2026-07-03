import {setup} from '../../../../setup.mjs';

const appName = 'RestoreOrchestratorTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs';
import fsExtra         from 'fs-extra';
import os              from 'os';
import path            from 'path';

// Serial mode: this file mutates SDK service methods and StorageRouter accessors across
// beforeAll/beforeEach. Running in serial protects against intra-file races during
// local multi-worker runs. CI uses workers:1 (see playwright.config.unit.mjs).
test.describe.configure({mode: 'serial'});

test.describe('restore.mjs orchestrator — bundle-aware substrate restore (#10871 AC-B)', () => {
    let SDK, runRestore, validateBundle, parseArgs;
    let KB_DatabaseService, Memory_DatabaseService, Memory_StorageRouter, Shared_DestructiveOperationGuard;
    let originalKbManageBackup, originalMcManageBackup;
    let originalMemColl, originalSumColl;
    let originalGuardAssert;
    let workRoot;
    const calls = {kb: [], mc: [], guard: []};

    const silentLogger = {log: () => {}, warn: () => {}, error: () => {}};

    /**
     * Builds a synthetic well-formed bundle directory under workRoot.
     */
    function buildSyntheticBundle({
        bundleName,
        chromaUnified,
        shared_topology,
        includeMailbox = true,
        omitSubdirs = []
    }) {
        const bundleRoot = path.join(workRoot, bundleName);
        fs.mkdirSync(bundleRoot, {recursive: true});

        const subdirs = ['kb', 'mc', 'graph', 'concepts', 'trajectories'];
        if (includeMailbox) subdirs.push('mailbox');

        for (const sub of subdirs) {
            if (omitSubdirs.includes(sub)) continue;
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }

        if (!omitSubdirs.includes('kb')) {
            fs.writeFileSync(
                path.join(bundleRoot, 'kb', 'knowledge-base-backup-2026.jsonl'),
                '{"id":"kb-1","embedding":[0.1],"metadata":{"k":"class"},"document":"kb-doc"}\n'
            );
        }
        if (!omitSubdirs.includes('mc')) {
            fs.writeFileSync(
                path.join(bundleRoot, 'mc', 'memory-backup-2026.jsonl'),
                '{"id":"m-1","embedding":[0.2],"metadata":{"t":"prompt"},"document":"mem-doc"}\n'
            );
            fs.writeFileSync(
                path.join(bundleRoot, 'mc', 'summaries-backup-2026.jsonl'),
                '{"id":"s-1","embedding":[0.3],"metadata":{"cat":"feat"},"document":"sum-doc"}\n'
            );
        }
        if (!omitSubdirs.includes('graph')) {
            fs.writeFileSync(
                path.join(bundleRoot, 'graph', 'graph-backup-2026.jsonl'),
                '{"type":"node","data":{"id":"n-1"}}\n'
            );
        }
        if (!omitSubdirs.includes('concepts')) {
            fs.writeFileSync(path.join(bundleRoot, 'concepts', 'nodes.jsonl'),
                '{"id":"concept-n1"}\n');
        }
        if (!omitSubdirs.includes('trajectories')) {
            fs.writeFileSync(path.join(bundleRoot, 'trajectories', 'trajectories.jsonl'),
                '{"turn":1}\n');
        }
        if (includeMailbox && !omitSubdirs.includes('mailbox')) {
            fs.writeFileSync(path.join(bundleRoot, 'mailbox', 'sent-to-cull.jsonl'),
                '{"culled":"msg-1"}\n');
        }

        const meta = {
            bundleVersion: 1,
            timestamp    : '2026-05-07T00-00-00.000Z',
            completedAt  : '2026-05-07T00:00:01.000Z',
            subsystems   : {kb: 1, mc: 2, graph: 1, concepts: {copied: 1}, trajectories: {copied: 1}, mailbox: {copied: 1}},
            integrity    : [{subsystem: 'kb', status: 'pass'}],
            topology     : {
                chromaUnified,
                shared_topology,
                kbChromaCoords: {host: 'localhost', port: 8000, path: '/path/to/kb'},
                mcChromaCoords: {host: 'localhost', port: 8000, dataDir: '/path/to/mc'}
            },
            neoVersion: '12.2.0',
            gitSha    : 'abcdef'
        };
        fs.writeFileSync(path.join(bundleRoot, 'bundle-meta.json'), JSON.stringify(meta, null, 2));

        return bundleRoot;
    }

    test.beforeAll(async () => {
        SDK = await import('../../../../../../ai/services.mjs');
        ({runRestore, validateBundle, parseArgs} = await import('../../../../../../ai/scripts/maintenance/restore.mjs'));

        KB_DatabaseService              = SDK.KB_DatabaseService;
        Memory_DatabaseService          = SDK.Memory_DatabaseService;
        Memory_StorageRouter            = SDK.Memory_StorageRouter;
        Shared_DestructiveOperationGuard = SDK.Shared_DestructiveOperationGuard;

        workRoot = path.resolve(process.cwd(), 'tmp', `restore-orch-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});

        originalKbManageBackup = KB_DatabaseService.manageDatabaseBackup.bind(KB_DatabaseService);
        originalMcManageBackup = Memory_DatabaseService.manageDatabaseBackup.bind(Memory_DatabaseService);
        originalMemColl        = Memory_StorageRouter.getMemoryCollection?.bind(Memory_StorageRouter);
        originalSumColl        = Memory_StorageRouter.getSummaryCollection?.bind(Memory_StorageRouter);
        originalGuardAssert    = Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed.bind(Shared_DestructiveOperationGuard);
    });

    test.afterAll(() => {
        KB_DatabaseService.manageDatabaseBackup     = originalKbManageBackup;
        Memory_DatabaseService.manageDatabaseBackup = originalMcManageBackup;
        if (originalMemColl) Memory_StorageRouter.getMemoryCollection  = originalMemColl;
        if (originalSumColl) Memory_StorageRouter.getSummaryCollection = originalSumColl;
        Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed = originalGuardAssert;

        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    test.beforeEach(() => {
        calls.kb.length    = 0;
        calls.mc.length    = 0;
        calls.guard.length = 0;

        KB_DatabaseService.manageDatabaseBackup = async (args) => {
            calls.kb.push(args);
            return {action: args.action, mode: args.mode, imported: 1};
        };
        Memory_DatabaseService.manageDatabaseBackup = async (args) => {
            calls.mc.push(args);
            return {action: args.action, mode: args.mode, imported: 2};
        };
        Memory_StorageRouter.getMemoryCollection  = async () => ({count: async () => 0});
        Memory_StorageRouter.getSummaryCollection = async () => ({count: async () => 0});
        Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed = async (args) => {
            calls.guard.push(args);
            return {allowed: true, classification: 'disposable'};
        };
    });

    test('happy-path merge: routes embedded substrates through SDK and copies flat files', async () => {
        const bundleRoot  = buildSyntheticBundle({bundleName: 'happy-merge', shared_topology: true});
        const conceptsTgt = path.join(workRoot, 'happy-merge-targets', 'concepts');
        const trajTgt     = path.join(workRoot, 'happy-merge-targets', 'trajectories.jsonl');
        const mailboxTgt  = path.join(workRoot, 'happy-merge-targets', 'sent-to-cull.jsonl');

        const result = await runRestore({
            bundleRoot,
            mode                  : 'merge',
            conceptsTargetDir     : conceptsTgt,
            trajectoriesTargetFile: trajTgt,
            sentToCullTargetFile  : mailboxTgt,
            logger                : silentLogger
        });

        expect(result.bundleRoot).toBe(bundleRoot);
        expect(result.mode).toBe('merge');
        expect(result.meta).toBeDefined();
        expect(result.meta.bundleVersion).toBe(1);
        expect(result.topology.match).toBe(true);

        // KB called once
        expect(calls.kb).toHaveLength(1);
        expect(calls.kb[0].action).toBe('import');
        expect(calls.kb[0].mode).toBe('merge');
        expect(calls.kb[0].file).toBe(path.join(bundleRoot, 'kb'));

        // MC called twice (once for mc/, once for graph/)
        expect(calls.mc).toHaveLength(2);
        expect(calls.mc.map(c => c.file)).toEqual(
            expect.arrayContaining([path.join(bundleRoot, 'mc'), path.join(bundleRoot, 'graph')])
        );

        // Flat files copied
        expect(fs.existsSync(path.join(conceptsTgt, 'nodes.jsonl'))).toBe(true);
        expect(fs.existsSync(trajTgt)).toBe(true);
        expect(fs.existsSync(mailboxTgt)).toBe(true);

        // Guard not invoked in merge mode for flat files
        expect(calls.guard).toHaveLength(0);
    });

    test('integrity-failure refusal: missing required subdir throws BEFORE any service call', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'corrupt-missing-mc', omitSubdirs: ['mc']});

        await expect(
            runRestore({bundleRoot, logger: silentLogger})
        ).rejects.toThrow(/Required bundle subdirectory missing: mc/);

        // No SDK writes attempted
        expect(calls.kb).toHaveLength(0);
        expect(calls.mc).toHaveLength(0);
        expect(calls.guard).toHaveLength(0);
    });

    test('topology mismatch: refused without --force-topology-mismatch, allowed with', async () => {
        // Bundle declares chromaUnified=false; current deployment is permanently unified
        const bundleRoot = buildSyntheticBundle({bundleName: 'topo-mismatch', chromaUnified: false});

        await expect(
            runRestore({bundleRoot, logger: silentLogger})
        ).rejects.toThrow(/Topology mismatch: bundle was taken under legacy federated mode, but current deployment is permanently unified\./);

        expect(calls.kb).toHaveLength(0);
        expect(calls.mc).toHaveLength(0);

        const result = await runRestore({
            bundleRoot,
            forceTopologyMismatch : true,
            conceptsTargetDir     : path.join(workRoot, 'topo-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'topo-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'topo-targets', 'sent-to-cull.jsonl'),
            logger                : silentLogger
        });
        expect(result.topology.match).toBe(false);
        expect(result.topology.forced).toBe(true);
        expect(calls.kb).toHaveLength(1);
    });

    test('replace mode without --force refuses non-empty target', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'replace-no-force', shared_topology: true});

        // Stub MC collections as non-empty
        Memory_StorageRouter.getMemoryCollection = async () => ({count: async () => 42});

        await expect(
            runRestore({bundleRoot, mode: 'replace', force: false, logger: silentLogger})
        ).rejects.toThrow(/Refusing replace mode without --force.*mc\.memories=42/);

        expect(calls.kb).toHaveLength(0);
        expect(calls.mc).toHaveLength(0);
    });

    test('replace mode with --force fires guard for flat substrates and forwards mode through SDK', async () => {
        const bundleRoot  = buildSyntheticBundle({bundleName: 'replace-force', shared_topology: true});
        const conceptsTgt = path.join(workRoot, 'replace-targets', 'concepts');
        const trajTgt     = path.join(workRoot, 'replace-targets', 'trajectories.jsonl');
        const mailboxTgt  = path.join(workRoot, 'replace-targets', 'sent-to-cull.jsonl');

        // Targets empty so --force-not-needed-due-to-empty-targets passes the pre-flight occupancy check.
        // Goal of this test: assert guard fires for flat substrates AND mode=replace forwards through SDK.

        const result = await runRestore({
            bundleRoot,
            mode                  : 'replace',
            confirmation          : 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE',
            conceptsTargetDir     : conceptsTgt,
            trajectoriesTargetFile: trajTgt,
            sentToCullTargetFile  : mailboxTgt,
            logger                : silentLogger
        });

        expect(result.mode).toBe('replace');
        expect(calls.kb[0].mode).toBe('replace');
        expect(calls.kb[0].confirmation).toBe('CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE');
        expect(calls.mc[0].mode).toBe('replace');
        expect(calls.mc[1].mode).toBe('replace');

        // Guard fired for each flat substrate (concepts, trajectories, mailbox = 3 invocations)
        expect(calls.guard).toHaveLength(3);
        const operations = calls.guard.map(c => c.operation).sort();
        expect(operations).toEqual([
            'restore.concepts.replace',
            'restore.mailbox.replace',
            'restore.trajectories.replace'
        ]);

        // Each guard call carries source + target path descriptors + confirmation
        for (const c of calls.guard) {
            expect(c.target.path).toBeTruthy();
            expect(c.source.path).toBeTruthy();
            expect(c.confirmation).toBe('CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE');
            expect(c.mode).toBe('replace');
        }
    });

    test('merge mode skips existing flat-file targets to preserve operator additions', async () => {
        const bundleRoot  = buildSyntheticBundle({bundleName: 'merge-preserve', chromaUnified: true});
        const conceptsTgt = path.join(workRoot, 'preserve-targets', 'concepts');
        const trajTgt     = path.join(workRoot, 'preserve-targets', 'trajectories.jsonl');
        const mailboxTgt  = path.join(workRoot, 'preserve-targets', 'sent-to-cull.jsonl');

        // Pre-populate targets with operator data
        fs.mkdirSync(conceptsTgt, {recursive: true});
        fs.writeFileSync(path.join(conceptsTgt, 'nodes.jsonl'), '{"id":"existing-operator-data"}\n');
        fs.mkdirSync(path.dirname(trajTgt), {recursive: true});
        fs.writeFileSync(trajTgt, '{"existing":"operator-trajectory"}\n');
        fs.writeFileSync(mailboxTgt, '{"existing":"operator-mailbox"}\n');

        const result = await runRestore({
            bundleRoot,
            mode                  : 'merge',
            conceptsTargetDir     : conceptsTgt,
            trajectoriesTargetFile: trajTgt,
            sentToCullTargetFile  : mailboxTgt,
            logger                : silentLogger
        });

        expect(result.subsystems.concepts.skipped).toBe(1);
        expect(result.subsystems.trajectories.skipped).toBe(true);
        expect(result.subsystems.mailbox.skipped).toBe(true);

        // Targets preserved
        expect(fs.readFileSync(path.join(conceptsTgt, 'nodes.jsonl'), 'utf8'))
            .toMatch(/existing-operator-data/);
        expect(fs.readFileSync(trajTgt, 'utf8'))
            .toMatch(/operator-trajectory/);
        expect(fs.readFileSync(mailboxTgt, 'utf8'))
            .toMatch(/operator-mailbox/);
    });

    test('legacy bundle without bundle-meta.json proceeds with topology check skipped', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'legacy-no-meta', chromaUnified: true});
        fs.unlinkSync(path.join(bundleRoot, 'bundle-meta.json'));

        const result = await runRestore({
            bundleRoot,
            conceptsTargetDir     : path.join(workRoot, 'legacy-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'legacy-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'legacy-targets', 'sent-to-cull.jsonl'),
            logger                : silentLogger
        });

        expect(result.meta).toBeNull();
        expect(result.topology.bundleChromaUnified).toBeUndefined();
        expect(result.topology.match).toBe(true);
        expect(calls.kb).toHaveLength(1);
    });

    test('rejects unknown mode at orchestrator entry', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'unknown-mode', chromaUnified: true});
        await expect(
            runRestore({bundleRoot, mode: 'wipe', logger: silentLogger})
        ).rejects.toThrow(/Unknown mode: wipe/);
    });

    test('rejects malformed JSONL during pre-flight integrity check', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'malformed-jsonl', chromaUnified: true});
        fs.writeFileSync(path.join(bundleRoot, 'kb', 'broken.jsonl'), 'this-is-not-json\n');

        await expect(
            runRestore({bundleRoot, logger: silentLogger})
        ).rejects.toThrow(/Bundle JSONL parse error at kb\/broken\.jsonl/);

        expect(calls.kb).toHaveLength(0);
    });

    test('parseArgs: positional bundle path + --mode + --force + --force-topology-mismatch', () => {
        // #11141: parseArgs return shape extended with filterLabels/filterEdgeTypes/onlySubstrate/postRestoreHook.
        // Defaults preserved when those flags are absent (covered separately in restore-filters.spec.mjs).
        expect(parseArgs(['/some/bundle'])).toEqual({
            bundleRoot           : '/some/bundle',
            mode                 : 'merge',
            force                : false,
            forceTopologyMismatch: false,
            filterLabels         : [],
            filterEdgeTypes      : [],
            onlySubstrate        : null,
            postRestoreHook      : null
        });
        expect(parseArgs(['/some/bundle', '--mode', 'replace', '--force'])).toEqual({
            bundleRoot           : '/some/bundle',
            mode                 : 'replace',
            force                : true,
            forceTopologyMismatch: false,
            filterLabels         : [],
            filterEdgeTypes      : [],
            onlySubstrate        : null,
            postRestoreHook      : null
        });
        expect(parseArgs(['/some/bundle', '--force-topology-mismatch'])).toEqual({
            bundleRoot           : '/some/bundle',
            mode                 : 'merge',
            force                : false,
            forceTopologyMismatch: true,
            filterLabels         : [],
            filterEdgeTypes      : [],
            onlySubstrate        : null,
            postRestoreHook      : null
        });
        expect(() => parseArgs([])).toThrow(/Missing required argument/);
        expect(() => parseArgs(['/x', '--unknown-flag'])).toThrow(/Unknown flag/);
    });

    test('validateBundle: standalone validation call returns parsed meta', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'validate-only', chromaUnified: true});
        const layout     = {
            kb          : path.join(bundleRoot, 'kb'),
            mc          : path.join(bundleRoot, 'mc'),
            graph       : path.join(bundleRoot, 'graph'),
            concepts    : path.join(bundleRoot, 'concepts'),
            trajectories: path.join(bundleRoot, 'trajectories'),
            mailbox     : path.join(bundleRoot, 'mailbox')
        };
        const meta = await validateBundle(bundleRoot, layout, silentLogger);
        expect(meta.bundleVersion).toBe(1);
        expect(meta.topology.chromaUnified).toBe(true);
    });
});

test.describe('verifyLatestBackupRestorable — read-only restorability probe (#14030 AC2)', () => {
    let verifyLatestBackupRestorable;
    let probeRoot;
    const silent = {log: () => {}, warn: () => {}, error: () => {}};

    const writeBundle = (name, {torn = false} = {}) => {
        const bundleRoot = path.join(probeRoot, name);
        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }
        fs.writeFileSync(path.join(bundleRoot, 'mc', 'memory-backup.jsonl'),
            torn ? '{this is not valid json\n' : '{"id":"m-1"}\n');
        return bundleRoot;
    };

    test.beforeAll(async () => {
        ({verifyLatestBackupRestorable} = await import('../../../../../../ai/scripts/maintenance/restore.mjs'));
    });

    test.beforeEach(() => {
        probeRoot = path.join(os.tmpdir(), `neo-restorable-probe-${process.pid}-${Date.now()}`);
        fs.mkdirSync(probeRoot, {recursive: true});
    });

    test.afterEach(() => {
        fsExtra.removeSync(probeRoot);
    });

    test('empty root, torn-newest, and valid-newest verdicts (#14030 AC2)', async () => {
        // (1) no bundles → not restorable, with a clear reason.
        const empty = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});
        expect(empty.restorable).toBe(false);
        expect(empty.reason).toMatch(/no backup-\* bundles/);
        expect(empty.checkedAt).toBeTruthy();

        // (2) an older valid bundle + a NEWER torn bundle → the newest is selected → not restorable.
        writeBundle('backup-2026-05-01T00-00-00');
        writeBundle('backup-2026-06-01T00-00-00', {torn: true});
        const torn = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});
        expect(torn.restorable).toBe(false);
        expect(torn.bundleRoot).toContain('backup-2026-06-01T00-00-00');
        expect(torn.reason).toMatch(/parse error/);

        // (3) replace the newest with a valid bundle → restorable, no reason.
        fsExtra.removeSync(path.join(probeRoot, 'backup-2026-06-01T00-00-00'));
        writeBundle('backup-2026-06-02T00-00-00');
        const ok = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});
        expect(ok.restorable).toBe(true);
        expect(ok.bundleRoot).toContain('backup-2026-06-02T00-00-00');
        expect(ok.reason).toBeNull();
    });
});
