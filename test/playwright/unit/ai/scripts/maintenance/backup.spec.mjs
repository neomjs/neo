import {setup} from '../../../../setup.mjs';

const appName = 'BackupOrchestratorTest';

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
import path            from 'path';

// Serial mode is declared on the ONE describe that needs it, not on the file. Only the orchestrator
// block mutates KB + MC singleton collection accessors across beforeAll/afterAll, so only its
// ordering has to be constrained; the other three blocks import pure functions and scope their
// fixtures to a pid+timestamp temp dir. File-level serial made any failure in the first block skip
// every test after it — 42 of them, measured — which reports "1 failed" while nothing else ran, and
// a summary that hides its own blast radius is worse than a louder one. CI runs workers:1 (see
// playwright.config.unit.mjs) so the constraint is local-DX either way.

/**
 * @summary Whether a copy subsystem's receipt accounts for itself — it copied rows, or it names the
 * source that was absent.
 *
 * The distinction this exists to draw: a bundle folder is created before its subsystem runs, so
 * folder existence proves nothing about whether anything landed in it. A receipt reading `copied: 0`
 * with no explanation is the case that must fail — it is indistinguishable, from the outside, from a
 * subsystem that silently did nothing. `ledgers` nests its own per-source receipts, so an accounted
 * parent may carry the explanation entirely in its children.
 *
 * @param {Object} receipt A `subsystems.<name>` entry from `runBackup`.
 * @returns {Boolean}
 */
function copyReceiptIsAccounted(receipt) {
    if (!receipt || typeof receipt !== 'object') {
        return false
    }

    if (Number.isFinite(receipt.copied) && receipt.copied > 0) {
        return true
    }

    if (typeof receipt.note === 'string' && receipt.note.length > 0) {
        return true
    }

    const nested = Object.values(receipt).filter(value => value && typeof value === 'object');

    return nested.length > 0 && nested.every(copyReceiptIsAccounted)
}

test.describe('backup.mjs orchestrator — atomic bundle assembly (#10129 Phase 2)', () => {
    test.describe.configure({mode: 'serial'});

    let SDK, fsExtra, runBackup;
    let KB_ChromaManager, Memory_StorageRouter;
    let originalKbCollection, originalMcGetMemory, originalMcGetSummary;
    let workRoot, bundleRoot, conceptsSourceDir, trajectoriesSourceFile;

    const fakeCollection = (rows, name) => ({
        name,
        count: async () => rows.length,
        get  : async ({include = [], limit, offset = 0} = {}) => {
            if (include.length === 0) return {ids: rows.map(r => r.id)};
            const sliced = rows.slice(offset, offset + (limit ?? rows.length));
            return {
                ids       : sliced.map(r => r.id),
                documents : sliced.map(r => r.document),
                metadatas : sliced.map(r => r.metadata),
                embeddings: sliced.map(r => r.embedding)
            };
        }
    });

    let verifyBundleIntegrity;
    let countNonEmptyJsonlLines;
    let noticeLegacyBackupRoot;

    test.beforeAll(async () => {
        SDK                   = await import('../../../../../../ai/services.mjs');
        fsExtra               = (await import('fs-extra')).default;
        ({runBackup, verifyBundleIntegrity, countNonEmptyJsonlLines, noticeLegacyBackupRoot} = await import('../../../../../../ai/scripts/maintenance/backup.mjs'));
        KB_ChromaManager      = SDK.KB_ChromaManager;
        Memory_StorageRouter  = SDK.Memory_StorageRouter;

        workRoot = path.resolve(process.cwd(), 'tmp', `backup-orch-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});

        bundleRoot             = path.join(workRoot, 'bundle');
        conceptsSourceDir      = path.join(workRoot, 'concepts-source');
        trajectoriesSourceFile = path.join(workRoot, 'trajectories-source', 'trajectories.jsonl');

        fs.mkdirSync(conceptsSourceDir, {recursive: true});
        fs.mkdirSync(path.dirname(trajectoriesSourceFile), {recursive: true});

        fs.writeFileSync(path.join(conceptsSourceDir, 'nodes.jsonl'), '{"id":"n1"}\n');
        fs.writeFileSync(path.join(conceptsSourceDir, 'edges.jsonl'), '{"source":"n1","target":"n2"}\n');
        fs.writeFileSync(trajectoriesSourceFile, '{"turn":1}\n{"turn":2}\n');

        originalKbCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
        originalMcGetMemory  = Memory_StorageRouter.getMemoryCollection.bind(Memory_StorageRouter);
        originalMcGetSummary = Memory_StorageRouter.getSummaryCollection.bind(Memory_StorageRouter);

        KB_ChromaManager.getKnowledgeBaseCollection = async () => fakeCollection(
            [{id: 'kb-1', embedding: [0.1], metadata: {k: 'class'},  document: 'kb-doc'}],
            'fake-kb'
        );
        Memory_StorageRouter.getMemoryCollection = async () => fakeCollection(
            [{id: 'm-1', embedding: [0.3], metadata: {t: 'prompt'}, document: 'mem-doc'}],
            'fake-mem'
        );
        Memory_StorageRouter.getSummaryCollection = async () => fakeCollection(
            [{id: 's-1', embedding: [0.4], metadata: {cat: 'feat'}, document: 'sum-doc'}],
            'fake-sum'
        );
    });

    test.afterAll(() => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalKbCollection;
        Memory_StorageRouter.getMemoryCollection    = originalMcGetMemory;
        Memory_StorageRouter.getSummaryCollection   = originalMcGetSummary;

        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    test('every subsystem in the bundle either exported, or named the source it had none of (#16617)', async () => {
        const silentLogger = {log: () => {}, error: () => {}};

        const result = await runBackup({
            bundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger: silentLogger
        });

        expect(result.bundleRoot).toBe(bundleRoot);

        // The bundle's own layout, not a hand-counted subset of it. The list this replaced named
        // five folders while `runBackup` creates seven — so `mailbox` and `ledgers` were outside
        // every assertion in this file, which is exactly where a subsystem that exports nothing
        // goes unnoticed.
        expect(fs.readdirSync(bundleRoot).sort()).toEqual([
            'bundle-meta.json', 'concepts', 'graph', 'kb', 'ledgers', 'mailbox', 'mc', 'trajectories'
        ]);

        const kbFiles = fs.readdirSync(path.join(bundleRoot, 'kb')).filter(f => f.endsWith('.jsonl'));
        expect(kbFiles.length).toBe(1);
        expect(kbFiles[0].startsWith('knowledge-base-backup-')).toBe(true);

        const mcFiles = fs.readdirSync(path.join(bundleRoot, 'mc')).filter(f => f.endsWith('.jsonl')).sort();
        expect(mcFiles.length).toBe(2);
        expect(mcFiles.some(f => f.startsWith('memory-backup-'))).toBe(true);
        expect(mcFiles.some(f => f.startsWith('summaries-backup-'))).toBe(true);

        const conceptFiles = fs.readdirSync(path.join(bundleRoot, 'concepts')).sort();
        expect(conceptFiles).toEqual(['edges.jsonl', 'nodes.jsonl']);

        const trajFiles = fs.readdirSync(path.join(bundleRoot, 'trajectories'));
        expect(trajFiles).toEqual(['trajectories.jsonl']);

        expect(result.subsystems.concepts).toEqual({copied: 2});
        expect(result.subsystems.trajectories).toEqual({copied: 1});
        expect(result.subsystems.mc.count).toBe(2);

        // Every subsystem must prove it either EXPORTED or named its own zero. The folder-existence
        // loop this replaced could not tell those apart — an empty directory satisfied it, so a
        // subsystem that exported nothing looked identical to one that worked.
        //
        // No row counts are pinned for `graph`: its size comes from the run-scoped test graph store,
        // so asserting a number would make this verdict track corpus fill, which is the defect this
        // ticket exists to remove. `verifyBundleIntegrity` already compares source against bundle,
        // and `pass` is reachable only above zero — zero-parity is reported as `empty` and a missing
        // count as `skipped`. So `pass` carries "exported, and completely" without naming a size.
        const integrityBy = Object.fromEntries(result.meta.integrity.map(check => [check.subsystem, check]));

        expect(Object.keys(integrityBy).sort(), 'every recovery substrate is checked').toEqual(['graph', 'kb', 'mc']);

        for (const subsystem of ['kb', 'mc', 'graph']) {
            const check = integrityBy[subsystem];

            expect(check.status, `${subsystem}: exported nothing, or its skip is unnamed`).toBe('pass');
            expect(check.bundleCount, `${subsystem}: row-count parity`).toBe(check.sourceCount);
            expect(check.sourceCount, `${subsystem}: a zero-row export is not a recovery source`)
                .toBeGreaterThan(0);
        }

        // The copy subsystems. `mailbox` and `ledgers` genuinely have no source in this fixture, and
        // that is the named-skip half: `copied: 0` is acceptable only when the receipt carries the
        // note saying which source was absent. An unexplained zero fails.
        for (const [subsystem, receipt] of Object.entries(result.subsystems)) {
            if (['kb', 'mc', 'graph'].includes(subsystem)) {
                continue
            }

            expect(copyReceiptIsAccounted(receipt), `${subsystem}: ${JSON.stringify(receipt)}`).toBe(true);
        }
    });

    test('keeps the final root invisible until capture completes, then publishes it without staging residue (#16417)', async () => {
        const
            finalRoot      = path.join(workRoot, 'publish-after-capture'),
            silentLogger   = {log: () => {}, error: () => {}},
            originalRename = fsExtra.rename;

        let releaseRename, signalRenameStarted;

        const renameStarted = new Promise(resolve => { signalRenameStarted = resolve });
        const renameRelease = new Promise(resolve => { releaseRename = resolve });
        let backupPromise;

        try {
            fsExtra.rename = async function(source, destination) {
                if (destination === finalRoot) {
                    expect(path.basename(source)).toMatch(/^\.backup-partial-/);
                    expect(fs.existsSync(path.join(source, 'bundle-meta.json'))).toBe(true);
                    expect(fs.existsSync(finalRoot)).toBe(false);
                    signalRenameStarted();
                    await renameRelease
                }

                return originalRename.call(this, source, destination)
            };

            backupPromise = runBackup({
                bundleRoot: finalRoot,
                conceptsSourceDir,
                trajectoriesSourceFile,
                logger    : silentLogger
            });

            const boundary = await Promise.race([
                renameStarted.then(() => 'rename'),
                backupPromise.then(() => 'completed')
            ]);

            expect(boundary).toBe('rename');
            expect(fs.existsSync(finalRoot)).toBe(false);
            expect(
                fs.readdirSync(workRoot).filter(name => name.startsWith(`.backup-partial-${path.basename(finalRoot)}-`))
            ).toHaveLength(1);

            releaseRename();

            const result        = await backupPromise;
            const persistedMeta = JSON.parse(fs.readFileSync(path.join(finalRoot, 'bundle-meta.json'), 'utf8'));
            const mcBackupFile  = result.subsystems.mc.memories.backupFile;

            expect(result.bundleRoot).toBe(finalRoot);
            expect(fs.existsSync(path.join(finalRoot, 'bundle-meta.json'))).toBe(true);
            expect(JSON.stringify({persistedMeta, result})).not.toContain('.backup-partial-');
            expect(mcBackupFile.startsWith(`${finalRoot}${path.sep}`)).toBe(true);
            expect(fs.existsSync(mcBackupFile)).toBe(true);
            expect(persistedMeta.subsystems.mc.memories.backupFile).toBe(mcBackupFile);

            if (process.platform !== 'win32') {
                expect(fs.statSync(finalRoot).mode & 0o777).toBe(0o777 & ~process.umask())
            }

            expect(
                fs.readdirSync(workRoot).filter(name => name.startsWith(`.backup-partial-${path.basename(finalRoot)}-`))
            ).toHaveLength(0);
        } finally {
            releaseRename?.();
            fsExtra.rename = originalRename;
            await backupPromise?.catch(() => {});
        }
    });

    test('a caught mid-capture failure leaves neither final nor staging root and preserves the original error (#16417)', async () => {
        const
            failure          = new Error('forced graph export failure'),
            finalRoot        = path.join(workRoot, 'failed-capture'),
            silentLogger     = {log: () => {}, error: () => {}},
            backupService    = SDK.Memory_DatabaseService,
            servicePrototype = Object.getPrototypeOf(backupService),
            originalBackup   = servicePrototype.manageDatabaseBackup;

        let thrown;

        try {
            servicePrototype.manageDatabaseBackup = async function(options) {
                if (options.include?.length === 1 && options.include[0] === 'graph') {
                    throw failure
                }

                return originalBackup.call(this, options)
            };

            try {
                await runBackup({
                    bundleRoot: finalRoot,
                    conceptsSourceDir,
                    trajectoriesSourceFile,
                    logger    : silentLogger
                })
            } catch (error) {
                thrown = error
            }

            expect(thrown).toBe(failure);
            expect(fs.existsSync(finalRoot)).toBe(false);
            expect(
                fs.readdirSync(workRoot).filter(name => name.startsWith(`.backup-partial-${path.basename(finalRoot)}-`))
            ).toHaveLength(0);
        } finally {
            servicePrototype.manageDatabaseBackup = originalBackup;
        }
    });

    test('an existing final destination fails loud without mutating it (#16417)', async () => {
        const
            finalRoot    = path.join(workRoot, 'existing-destination'),
            sentinelPath = path.join(finalRoot, 'sentinel.txt'),
            silentLogger = {log: () => {}, error: () => {}};

        fs.mkdirSync(finalRoot, {recursive: true});
        fs.writeFileSync(sentinelPath, 'keep-me');

        await expect(runBackup({
            bundleRoot: finalRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger    : silentLogger
        })).rejects.toThrow(/already exists/i);

        expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('keep-me');
        expect(fs.readdirSync(finalRoot)).toEqual(['sentinel.txt']);
    });

    test('a dangling final-destination symlink fails loud and remains untouched (#16417)', async () => {
        test.skip(process.platform === 'win32', 'symlink creation requires elevated privileges on some Windows hosts');

        const
            finalRoot     = path.join(workRoot, 'dangling-destination'),
            missingTarget = path.join(workRoot, 'missing-symlink-target'),
            silentLogger  = {log: () => {}, error: () => {}};

        fs.symlinkSync(missingTarget, finalRoot);

        await expect(runBackup({
            bundleRoot: finalRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger    : silentLogger
        })).rejects.toThrow(/already exists/i);

        expect(fs.lstatSync(finalRoot).isSymbolicLink()).toBe(true);
        expect(fs.readlinkSync(finalRoot)).toBe(missingTarget);
    });

    test('a long explicit final basename still has a bounded staging basename (#16417)', async () => {
        test.skip(process.platform === 'win32', 'the parent plus 230-character filename can exceed legacy MAX_PATH');

        const finalRoot = path.join(workRoot, `long-${'x'.repeat(225)}`);
        const result    = await runBackup({
            bundleRoot         : finalRoot,
            cleanOldBackupsImpl: async () => {},
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger             : {log: () => {}, error: () => {}}
        });

        expect(result.bundleRoot).toBe(finalRoot);
        expect(fs.existsSync(path.join(finalRoot, 'bundle-meta.json'))).toBe(true);
    });

    test('retention runs only after publication and cannot invalidate a completed bundle (#16417)', async () => {
        const
            finalRoot = path.join(workRoot, 'retention-after-publish'),
            warnings  = [];

        const result = await runBackup({
            bundleRoot         : finalRoot,
            cleanOldBackupsImpl: async () => {
                expect(fs.existsSync(path.join(finalRoot, 'bundle-meta.json'))).toBe(true);
                throw new Error('forced retention failure')
            },
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger: {
                error: () => {},
                log  : () => {},
                warn : message => warnings.push(message)
            }
        });

        expect(result.bundleRoot).toBe(finalRoot);
        expect(fs.existsSync(path.join(finalRoot, 'bundle-meta.json'))).toBe(true);
        expect(warnings).toEqual([expect.stringContaining('forced retention failure')]);
    });

    test('throwing post-publication diagnostics neither fail the bundle nor suppress retention (#16417)', async () => {
        const finalRoot       = path.join(workRoot, 'throwing-success-log');
        let   retentionCalled = false;

        const result = await runBackup({
            bundleRoot         : finalRoot,
            cleanOldBackupsImpl: async () => { retentionCalled = true },
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger             : {
                error: () => {},
                log  : message => {
                    if (message.startsWith('[8/8]') || message.startsWith('✅ Backup complete:')) {
                        throw new Error('closed terminal')
                    }
                }
            }
        });

        expect(result.bundleRoot).toBe(finalRoot);
        expect(retentionCalled).toBe(true);
        expect(fs.existsSync(path.join(finalRoot, 'bundle-meta.json'))).toBe(true);
    });

    test('reports missing concept/trajectory sources as non-fatal notes', async () => {
        const silentLogger  = {log: () => {}, error: () => {}};
        const altBundleRoot = path.join(workRoot, 'bundle-no-optional-sources');

        const result = await runBackup({
            bundleRoot            : altBundleRoot,
            conceptsSourceDir     : path.join(workRoot, 'does-not-exist-concepts'),
            trajectoriesSourceFile: path.join(workRoot, 'does-not-exist-trajectories.jsonl'),
            logger                : silentLogger
        });

        expect(result.subsystems.concepts.copied).toBe(0);
        expect(result.subsystems.concepts.note).toMatch(/source not present/);
        expect(result.subsystems.trajectories.copied).toBe(0);
        expect(result.subsystems.trajectories.note).toMatch(/source not present/);

        // KB + MC still run — bundle is valid even without optional sources.
        expect(fs.existsSync(path.join(altBundleRoot, 'kb'))).toBe(true);
        expect(fs.existsSync(path.join(altBundleRoot, 'mc'))).toBe(true);
    });

    test('mailbox: copies sent-to-cull.jsonl when source exists (#10871)', async () => {
        const silentLogger     = {log: () => {}, error: () => {}};
        const altBundleRoot    = path.join(workRoot, 'bundle-mailbox-present');
        const sentToCullSource = path.join(workRoot, 'mailbox-source', 'sent-to-cull.jsonl');

        fs.mkdirSync(path.dirname(sentToCullSource), {recursive: true});
        fs.writeFileSync(sentToCullSource, '{"culled":"msg-1"}\n{"culled":"msg-2"}\n');

        const result = await runBackup({
            bundleRoot          : altBundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            sentToCullSourceFile: sentToCullSource,
            logger              : silentLogger
        });

        expect(fs.existsSync(path.join(altBundleRoot, 'mailbox'))).toBe(true);
        expect(fs.readdirSync(path.join(altBundleRoot, 'mailbox'))).toEqual(['sent-to-cull.jsonl']);
        expect(result.subsystems.mailbox.copied).toBe(1);
    });

    test('writes bundle-meta.json with bundleVersion/timestamp/completedAt/topology/integrity/version (#10871)', async () => {
        const silentLogger  = {log: () => {}, error: () => {}};
        const altBundleRoot = path.join(workRoot, 'bundle-meta-schema');

        await runBackup({
            bundleRoot          : altBundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            sentToCullSourceFile: path.join(workRoot, 'does-not-exist-cull.jsonl'),
            logger              : silentLogger
        });

        const metaPath = path.join(altBundleRoot, 'bundle-meta.json');
        expect(fs.existsSync(metaPath)).toBe(true);

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

        expect(meta.bundleVersion).toBe(1);
        expect(meta.timestamp).toBeTruthy();
        expect(meta.completedAt).toBeTruthy();
        expect(meta.subsystems).toBeDefined();
        expect(meta.integrity).toBeInstanceOf(Array);

        expect(meta.topology).toBeDefined();
        expect(typeof meta.topology.shared_topology).toBe('boolean');
        expect(meta.topology.kbChromaCoords).toBeDefined();
        expect(meta.topology.mcChromaCoords).toBeDefined();
        expect('host' in meta.topology.kbChromaCoords).toBe(true);
        expect('port' in meta.topology.kbChromaCoords).toBe(true);
        expect('path' in meta.topology.kbChromaCoords).toBe(true);
        expect('host' in meta.topology.mcChromaCoords).toBe(true);
        expect('port' in meta.topology.mcChromaCoords).toBe(true);
        expect('dataDir' in meta.topology.mcChromaCoords).toBe(true);

        expect('neoVersion' in meta).toBe(true);
        expect('gitSha' in meta).toBe(true);
    });

    test('verifyBundleIntegrity: pass when bundle row count matches source count (#10871)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-pass');
        const kbDir    = path.join(tempRoot, 'kb');

        fs.mkdirSync(kbDir, {recursive: true});
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '{"id":"1"}\n{"id":"2"}\n{"id":"3"}\n');

        const checks = await verifyBundleIntegrity(
            {kb: kbDir, mc: path.join(tempRoot, 'mc-missing'), graph: path.join(tempRoot, 'graph-missing')},
            {kb: 3}
        );

        const kb = checks.find(c => c.subsystem === 'kb');
        expect(kb.status).toBe('pass');
        expect(kb.sourceCount).toBe(3);
        expect(kb.bundleCount).toBe(3);
    });

    test('verifyBundleIntegrity: fail when bundle row count diverges from source count (#10871)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-fail');
        const kbDir    = path.join(tempRoot, 'kb');

        fs.mkdirSync(kbDir, {recursive: true});
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '{"id":"1"}\n');

        const checks = await verifyBundleIntegrity(
            {kb: kbDir, mc: path.join(tempRoot, 'mc-missing'), graph: path.join(tempRoot, 'graph-missing')},
            {kb: 5}
        );

        const kb = checks.find(c => c.subsystem === 'kb');
        expect(kb.status).toBe('fail');
        expect(kb.sourceCount).toBe(5);
        expect(kb.bundleCount).toBe(1);
        expect(kb.reason).toMatch(/row-count mismatch/);
    });

    test('verifyBundleIntegrity: skipped when source count is non-numeric (#10871)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-skipped');
        const mcDir    = path.join(tempRoot, 'mc');

        fs.mkdirSync(mcDir, {recursive: true});

        const checks = await verifyBundleIntegrity(
            {kb: path.join(tempRoot, 'kb-missing'), mc: mcDir, graph: path.join(tempRoot, 'graph-missing')},
            {mc: {memories: 1, summaries: 1}}
        );

        const mc = checks.find(c => c.subsystem === 'mc');
        expect(mc.status).toBe('skipped');
        expect(mc.reason).toMatch(/no numeric source count/);
    });

    test('verifyBundleIntegrity: empty (not a silent pass) when source and bundle are both zero (#14030)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-empty');
        const kbDir    = path.join(tempRoot, 'kb');

        fs.mkdirSync(kbDir, {recursive: true});
        // The gutted-store signature: a populated deployment whose export came back empty. Both
        // sides agree at zero, so the old `bundleCount === sourceCount` branch reported 'pass' —
        // a false recovery source. It must surface as 'empty', never 'pass'.
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '');

        const checks = await verifyBundleIntegrity(
            {kb: kbDir, mc: path.join(tempRoot, 'mc-missing'), graph: path.join(tempRoot, 'graph-missing')},
            {kb: 0}
        );

        const kb = checks.find(c => c.subsystem === 'kb');
        expect(kb.status).toBe('empty');
        expect(kb.status).not.toBe('pass');
        expect(kb.sourceCount).toBe(0);
        expect(kb.bundleCount).toBe(0);
        expect(kb.reason).toMatch(/not a usable recovery source/);
    });

    test('runBackup propagates an empty subsystem to bundle-meta.integrity "empty" + a non-fatal warning (#14048)', async () => {
        // Close-target proof: the helper status alone is not enough — runBackup must keep a zero-row
        // subsystem non-fatal, WARN, and persist the status into bundle-meta.integrity (the
        // canary/alert handoff). Force MC (memories + summaries) to export zero rows.
        const warnings      = [];
        const captureLogger = {log: () => {}, error: () => {}, warn: msg => warnings.push(msg)};
        const savedMem      = Memory_StorageRouter.getMemoryCollection;
        const savedSum      = Memory_StorageRouter.getSummaryCollection;

        try {
            Memory_StorageRouter.getMemoryCollection  = async () => fakeCollection([], 'empty-mem');
            Memory_StorageRouter.getSummaryCollection = async () => fakeCollection([], 'empty-sum');

            const result = await runBackup({
                bundleRoot: path.join(workRoot, 'bundle-empty-subsystem'),
                conceptsSourceDir,
                trajectoriesSourceFile,
                logger    : captureLogger
            });

            const mcIntegrity = result.meta.integrity.find(check => check.subsystem === 'mc');
            expect(mcIntegrity.status).toBe('empty');           // persisted into bundle-meta.integrity
            expect(mcIntegrity.sourceCount).toBe(0);
            expect(mcIntegrity.bundleCount).toBe(0);
            expect(warnings.some(w => /ZERO rows|holding no rows/i.test(w))).toBe(true);  // runBackup warned, non-fatally
        } finally {
            Memory_StorageRouter.getMemoryCollection  = savedMem;
            Memory_StorageRouter.getSummaryCollection = savedSum;
        }
    });

    test('countNonEmptyJsonlLines: streams a JSONL file, counting non-empty lines (#14082)', async () => {
        // Regression: verifyBundleIntegrity used to read each bundle file fully into a string
        // (fs.readFile + split('\n')), which threw ERR_STRING_TOO_LONG on the 1+ GB Memory Core /
        // Knowledge Base exports (past V8's ~512 MB max string length). The streaming counter has no
        // such ceiling. This locks the exact non-empty-line semantics the parity check depends on:
        // blank lines and a missing trailing newline must not change the row count. The >512 MB
        // no-throw property is proven manually against the real ~1.2 GB MC export (PR evidence) —
        // materializing a 512 MB+ file in CI is prohibitively heavy.
        const tempRoot = path.join(workRoot, 'count-nonempty');
        const file     = path.join(tempRoot, 'rows.jsonl');

        fs.mkdirSync(tempRoot, {recursive: true});
        // 3 records — with a blank line, a whitespace-only line, and NO trailing newline on the last.
        fs.writeFileSync(file, '{"id":"1"}\n\n{"id":"2"}\n   \n{"id":"3"}');

        expect(await countNonEmptyJsonlLines(file)).toBe(3);
    });

    test('the bundle captures all three incident ledgers, reporting WHICH one was empty', async () => {
        // The other half of ledger survival. Before this, `orchestrator-state` was excluded from the
        // bundle — a fact the runbook already admitted as a standing caveat — so a volume replacement
        // destroyed the self-heal and recovery record with no copy anywhere.
        const silentLogger  = {error: () => {}, log: () => {}, warn: () => {}},
              ledgerRoot    = path.join(workRoot, 'ledger-src', 'orchestrator-daemon'),
              altBundleRoot = path.join(workRoot, 'bundle-with-ledgers'),
              ledgerSources = {
                  healAttemptsFile: path.join(ledgerRoot, 'heal-attempts.json'),
                  healEventsDir   : path.join(ledgerRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(ledgerRoot, 'recovery-runs')
              };

        fs.mkdirSync(ledgerSources.healEventsDir, {recursive: true});
        fs.mkdirSync(ledgerSources.recoveryRunsDir, {recursive: true});
        fs.writeFileSync(ledgerSources.healAttemptsFile, JSON.stringify({'kb:chunks': {attempts: 2}}));
        fs.writeFileSync(path.join(ledgerSources.healEventsDir, 'heal-events.jsonl'), '{"type":"freeze"}\n');
        // recovery-runs deliberately left EMPTY, so the per-ledger breakdown has something to
        // discriminate: a single aggregate count could not say which ledger had nothing in it.

        const result = await runBackup({
            bundleRoot: altBundleRoot,
            conceptsSourceDir,
            ledgerSources,
            logger    : silentLogger,
            trajectoriesSourceFile
        });

        const ledgersDir = path.join(altBundleRoot, 'ledgers');

        expect(fs.existsSync(path.join(ledgersDir, 'heal-attempts.json'))).toBe(true);
        expect(fs.existsSync(path.join(ledgersDir, 'heal-events.jsonl'))).toBe(true);
        expect(JSON.parse(fs.readFileSync(path.join(ledgersDir, 'heal-attempts.json'), 'utf8'))['kb:chunks'].attempts).toBe(2);

        // `recovery-runs` keeps its own subfolder — flattening per-run files beside the two singletons
        // would let a run id collide with a ledger filename.
        expect(fs.existsSync(path.join(ledgersDir, 'recovery-runs'))).toBe(true);

        // The per-ledger breakdown is the point: an aggregate of 2 would not tell an operator that the
        // recovery-run ledger specifically had nothing to bundle.
        expect(result.subsystems.ledgers.healAttempts.copied).toBe(1);
        expect(result.subsystems.ledgers.healEvents.copied).toBe(1);
        expect(result.subsystems.ledgers.recoveryRuns.copied).toBe(0);
        expect(result.subsystems.ledgers.copied).toBe(2);
    });

    test('an absent ledger is a note, not a backup failure', async () => {
        // A deployment that has never healed has no ledger. That is not a defect and must not fail a
        // backup — the same non-fatal contract concepts and trajectories already have.
        const silentLogger  = {error: () => {}, log: () => {}, warn: () => {}},
              altBundleRoot = path.join(workRoot, 'bundle-no-ledgers'),
              missingRoot   = path.join(workRoot, 'never-existed', 'orchestrator-daemon');

        const result = await runBackup({
            bundleRoot   : altBundleRoot,
            conceptsSourceDir,
            ledgerSources: {
                healAttemptsFile: path.join(missingRoot, 'heal-attempts.json'),
                healEventsDir   : path.join(missingRoot, 'data-heal-events'),
                recoveryRunsDir : path.join(missingRoot, 'recovery-runs')
            },
            logger       : silentLogger,
            trajectoriesSourceFile
        });

        expect(result.subsystems.ledgers.copied).toBe(0);
        expect(result.subsystems.ledgers.healAttempts.note).toMatch(/source not present/);
        expect(result.subsystems.ledgers.healEvents.note).toMatch(/source not present/);
        // The subfolder still exists, so a consumer never has to distinguish "no ledgers" from
        // "this bundle predates ledger capture" by the absence of a directory.
        expect(fs.existsSync(path.join(altBundleRoot, 'ledgers'))).toBe(true);
    });

    test.describe('noticeLegacyBackupRoot — the relocation notice', () => {
        // Injected fs: the point of these cases is the DECISION, not the filesystem. A real
        // temp-dir fixture would exercise fs-extra rather than the branch under test.
        const makeFs = ({legacyEntries = null, markerExists = false} = {}) => {
            const writes = [];

            return {
                writes,
                pathExists: async () => markerExists,
                ensureDir : async () => {},
                writeFile : async (file, body) => { writes.push({file, body}) },
                readdir   : async () => {
                    if (legacyEntries === null) {
                        const error = new Error('ENOENT');
                        error.code  = 'ENOENT';
                        throw error
                    }

                    return legacyEntries
                }
            }
        };

        test('fires and names BOTH roots when bundles remain at the legacy path', async () => {
            const
                logged = [],
                fsImpl = makeFs({legacyEntries: ['backup-2026-07-01T00-00-00.000Z', 'last-backup-receipt.json']}),
                fired  = await noticeLegacyBackupRoot({
                    currentRoot: '/new/backups',
                    legacyRoot : '/repo/.neo-ai-data/backups',
                    logger     : {warn: message => logged.push(message)},
                    fsImpl
                });

            expect(fired).toBe(true);
            expect(logged.join('\n')).toContain('/repo/.neo-ai-data/backups');
            expect(logged.join('\n')).toContain('/new/backups');

            // Nothing is moved or deleted: the ONLY write is the marker. This is the assertion
            // that would catch someone later "helpfully" migrating the bundles.
            expect(fsImpl.writes).toHaveLength(1);
            expect(fsImpl.writes[0].file).toContain('/new/backups')
        });

        test('does NOT repeat once the marker is present', async () => {
            const fired = await noticeLegacyBackupRoot({
                currentRoot: '/new/backups',
                legacyRoot : '/repo/.neo-ai-data/backups',
                logger     : {warn: () => {}},
                fsImpl     : makeFs({legacyEntries: ['backup-x'], markerExists: true})
            });

            expect(fired).toBe(false)
        });

        test('stays silent for a legacy root holding no bundles, and for one that does not exist', async () => {
            const base = {
                currentRoot: '/new/backups',
                legacyRoot : '/repo/.neo-ai-data/backups',
                logger     : {warn: () => {}}
            };

            expect(await noticeLegacyBackupRoot({...base, fsImpl: makeFs({legacyEntries: ['README.md']})})).toBe(false);

            // Absence is the healthy fresh-deployment case and must never surface as an error.
            expect(await noticeLegacyBackupRoot({...base, fsImpl: makeFs()})).toBe(false)
        });

        test('stays silent when both roots resolve alike — profiles that keep bundles in-plane on purpose', async () => {
            const fired = await noticeLegacyBackupRoot({
                currentRoot: '/plane/backups',
                legacyRoot : '/plane/backups',
                logger     : {warn: () => {}},
                fsImpl     : makeFs({legacyEntries: ['backup-x']})
            });

            expect(fired).toBe(false)
        });
    });
});

/**
 * @summary The corruption canary must be reachable by name, not only by knowing the file path.
 *
 * `backupCorruptionTimeline.mjs` is the artifact-verified diagnostic that classifies each retained
 * bundle by comparing its manifest claim against actual artifact bytes. Its own module summary says
 * it exists for "the empty-artifact false-green this incident produced" — it was written AFTER a
 * previous occurrence of that class. It then sat with no npm script, no scheduler entry, and no
 * caller anywhere in the repo.
 *
 * **A tool nothing invokes is not a control.** During a live incident the only way to learn the
 * answer was to know the file existed and run it by hand, which is precisely the knowledge an
 * operator in the middle of a suspected data loss does not have.
 *
 * These probes are static on purpose: they read `package.json` and the committed runbook, so no
 * ambient state can satisfy them.
 */
test.describe('backup corruption canary — reachable by name', () => {
    const repoRoot = process.cwd();

    test('a named npm script invokes the timeline tool', () => {
        const {scripts} = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

        expect(scripts['ai:check-backup-integrity']).toBeDefined();
        expect(scripts['ai:check-backup-integrity']).toContain('backupCorruptionTimeline.mjs');
        // Cross-platform, same rule as every other `ai:` entry — no shell env prefix.
        expect(scripts['ai:check-backup-integrity']).not.toMatch(/^\s*[A-Z_][A-Z0-9_]*=/);
    });

    test('the restoration runbook names the script and when to run it', () => {
        const runbook = fs.readFileSync(path.join(repoRoot, 'learn/agentos/tooling/RestorationRunbook.md'), 'utf8');

        expect(runbook).toContain('ai:check-backup-integrity');
        // Naming the command without naming the trigger leaves the operator exactly where they were:
        // holding a tool and no reason to reach for it.
        expect(runbook).toContain('lastSuccessful');
    });
});

test.describe('backup.mjs — capture lineage: a zero-row export is not a claim of emptiness (#16404)', () => {
    let buildCaptureBlock, listPublishedBundles, readPreviousBundleIdentities, captureRoot;

    /**
     * Writes a published bundle whose meta records one identity per source.
     * @param {String} name Bundle directory name.
     * @param {Object} sources `{key: collectionId}`.
     */
    function writePublishedBundle(name, sources) {
        const dir = path.join(captureRoot, name);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, 'bundle-meta.json'), JSON.stringify({
            capture: {
                schemaVersion: 1,
                sources      : Object.fromEntries(
                    Object.entries(sources).map(([key, collectionId]) => [key, {collectionId}])
                )
            }
        }));
    }

    test.beforeAll(async () => {
        ({buildCaptureBlock, listPublishedBundles, readPreviousBundleIdentities} =
            await import('../../../../../../ai/scripts/maintenance/backup.mjs'));
    });

    test.beforeEach(() => {
        captureRoot = path.resolve(process.cwd(), 'tmp', `capture-lineage-${process.pid}-${Date.now()}`);
        fs.mkdirSync(captureRoot, {recursive: true});
    });

    test.afterEach(() => {
        fs.rmSync(captureRoot, {recursive: true, force: true});
    });

    test('listPublishedBundles skips staging directories and returns newest first', async () => {
        writePublishedBundle('backup-2026-08-01T10-00-00.000Z', {});
        writePublishedBundle('backup-2026-08-03T10-00-00.000Z', {});
        // The staging directory an interrupted capture leaves behind. It is a real directory with a
        // real mtime; only the missing `backup-` prefix keeps it out, which is the contract restore
        // and retention already depend on.
        fs.mkdirSync(path.join(captureRoot, '.backup-partial-backup-2026-08-04T10-00-00.000Z-XyZ'), {recursive: true});

        const bundles = await listPublishedBundles(captureRoot);

        expect(bundles.map(b => b.name)).toEqual([
            'backup-2026-08-03T10-00-00.000Z',
            'backup-2026-08-01T10-00-00.000Z'
        ]);
    });

    test('a zero-row export with an UNCHANGED identity is genuinely empty', async () => {
        writePublishedBundle('backup-2026-08-02T10-00-00.000Z', {kb: 'collection-uuid-a'});

        const {sources} = await buildCaptureBlock({
            subsystems: {kb: {count: 0, collectionId: 'collection-uuid-a'}},
            backupRoot: captureRoot
        });

        expect(sources.kb.lineage).toBe('same');
        expect(sources.kb.provenEmpty).toBe(true)
    });

    test('a zero-row export with a CHANGED identity is NOT empty — it is unexplained', async () => {
        // The defect this ticket exists for. Both captures report zero rows and both would have logged
        // "Export complete."; only the identity distinguishes "the same source held nothing" from
        // "a different source is here now". A promotion or a restore changes the id legitimately — so
        // this asserts the receipt REFUSES the empty claim, not that it reports loss.
        writePublishedBundle('backup-2026-08-02T10-00-00.000Z', {kb: 'collection-uuid-a'});

        const {sources} = await buildCaptureBlock({
            subsystems: {kb: {count: 0, collectionId: 'collection-uuid-b'}},
            backupRoot: captureRoot
        });

        expect(sources.kb.rowState).toBe('zero');
        expect(sources.kb.lineage).toBe('changed');
        expect(sources.kb.provenEmpty).toBe(false)
    });

    test('a zero-row export with no predecessor degrades to unknown rather than claiming empty', async () => {
        const {comparedTo, sources} = await buildCaptureBlock({
            subsystems: {kb: {count: 0, collectionId: 'collection-uuid-a'}},
            backupRoot: captureRoot
        });

        expect(comparedTo).toBeNull();
        expect(sources.kb.lineage).toBe('unknown');
        expect(sources.kb.provenEmpty).toBe(false)
    });

    test('a populated export is never reported empty, whatever the lineage says', async () => {
        writePublishedBundle('backup-2026-08-02T10-00-00.000Z', {kb: 'collection-uuid-a'});

        const {sources} = await buildCaptureBlock({
            subsystems: {kb: {count: 12, collectionId: 'collection-uuid-b'}},
            backupRoot: captureRoot
        });

        expect(sources.kb.rowState).toBe('populated');
        expect(sources.kb.provenEmpty).toBe(false)
    });

    test('per-collection Memory Core receipts each carry their own lineage', async () => {
        writePublishedBundle('backup-2026-08-02T10-00-00.000Z', {
            'mc.memories' : 'memories-uuid-a',
            'mc.summaries': 'summaries-uuid-a'
        });

        const {sources} = await buildCaptureBlock({
            subsystems: {
                mc: {
                    memories : {exported: 0, collectionId: 'memories-uuid-a'},
                    summaries: {exported: 0, collectionId: 'summaries-uuid-b'}
                }
            },
            backupRoot: captureRoot
        });

        expect(sources['mc.memories'].provenEmpty).toBe(true);
        // One re-embedded collection must not drag its sibling's verdict with it.
        expect(sources['mc.summaries'].provenEmpty).toBe(false)
    });

    test('an unreadable predecessor degrades lineage instead of failing the backup', async () => {
        const dir = path.join(captureRoot, 'backup-2026-08-02T10-00-00.000Z');
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, 'bundle-meta.json'), '{ this is not json');

        const {bundleName, identities} = await readPreviousBundleIdentities(captureRoot, {warn: () => {}});

        expect(bundleName).toBe('backup-2026-08-02T10-00-00.000Z');
        expect(identities).toEqual({})
    });
});

/**
 * @summary One zero, two propositions, and the proof they cannot contradict each other.
 *
 * A bundle-meta carries two verdicts about the same zero-row export. `capture` answers PROVENANCE —
 * was there genuinely nothing to capture — and `integrity` answers SURVIVABILITY — does this bundle
 * hold rows a restore could bring back. Both originally called it `empty`, so a `zero + changed`
 * source published `capture.empty=false` beside `integrity[kb].status="empty"` in one artifact while
 * every downstream consumer read only the latter.
 *
 * The repair is lexical, not behavioural, and **which side gets renamed is the load-bearing part.**
 * The first attempt renamed the survivability status to `zero-rows` and introduced a worse defect
 * than the one it fixed: `integrity[].status` is a persisted wire value matched by exact string, so a
 * reader deployed before the rename classifies a NEW bundle as having no zero-row subsystem at all —
 * `restorable: true` for a bundle holding nothing. Compatibility runs one way only. So the status
 * keeps its token forever and the provenance claim, which nothing has persisted yet, is the one that
 * moved: it is named `provenEmpty`.
 *
 * Restorability is deliberately NOT rewired through lineage either — a zero-row bundle over a
 * replaced source is the most suspicious specimen in the series, and reading provenance into the
 * recovery verdict would promote exactly it.
 *
 * These specs traverse the real producers into the real consumers, because both defects were
 * invisible to every unit that tested one side, or one version, alone.
 */
test.describe('bundle-meta — provenance and survivability never contradict (#16404)', () => {
    let buildCaptureBlock, verifyBundleIntegrity, INTEGRITY_STATUS;
    let isBundleRestorable, summarizeBundleIntegrity, emptySubsystems;
    let root;

    test.beforeAll(async () => {
        ({buildCaptureBlock, verifyBundleIntegrity, INTEGRITY_STATUS} =
            await import('../../../../../../ai/scripts/maintenance/backup.mjs'));
        ({isBundleRestorable, summarizeBundleIntegrity, emptySubsystems} =
            await import('../../../../../../ai/services/memory-core/helpers/bundleIntegrity.mjs'));
    });

    test.beforeEach(() => {
        root = path.resolve(process.cwd(), 'tmp', `bundle-coherence-${process.pid}-${Date.now()}`);
        fs.mkdirSync(root, {recursive: true});
    });

    test.afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    /**
     * Assembles a bundle-meta the way `runBackup` does — real `verifyBundleIntegrity` over a real
     * bundle tree, real `buildCaptureBlock` over a real predecessor — so neither block is hand-built
     * and neither can drift from the producer it is supposed to mirror.
     *
     * @param {Object}       options
     * @param {Number}       options.rows        Rows written into the bundle AND reported by the source.
     * @param {String|null} [options.currentId]  KB collection identity observed this capture.
     * @param {String|null} [options.previousId] Identity the predecessor bundle recorded; omit for first run.
     * @returns {Promise<Object>} `{integrity, capture}` as `bundle-meta.json` would carry them.
     */
    async function buildMeta({rows, currentId = 'kb-id', previousId = null}) {
        const bundleTree   = path.join(root, 'tree'),
              kbDir        = path.join(bundleTree, 'kb'),
              predecessors = path.join(root, 'published');

        fs.mkdirSync(kbDir,        {recursive: true});
        fs.mkdirSync(predecessors, {recursive: true});
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '{"id":"r"}\n'.repeat(rows));

        if (previousId) {
            const dir = path.join(predecessors, 'backup-2026-08-02T10-00-00.000Z');
            fs.mkdirSync(dir, {recursive: true});
            fs.writeFileSync(path.join(dir, 'bundle-meta.json'), JSON.stringify({
                capture: {schemaVersion: 1, sources: {kb: {collectionId: previousId}}}
            }));
        }

        return {
            integrity: await verifyBundleIntegrity(
                {kb: kbDir, mc: path.join(bundleTree, 'no-mc'), graph: path.join(bundleTree, 'no-graph')},
                {kb: rows}
            ),
            capture  : await buildCaptureBlock({
                subsystems: {kb: {count: rows, collectionId: currentId}},
                backupRoot: predecessors
            })
        };
    }

    test('zero + SAME identity: genuinely empty, and still not a recovery source', async () => {
        const {integrity, capture} = await buildMeta({rows: 0, currentId: 'kb-id', previousId: 'kb-id'});

        expect(capture.sources.kb.provenEmpty).toBe(true);   // provenance: nothing was there
        expect(integrity[0].status).toBe('empty');           // survivability: nothing to restore
        expect(isBundleRestorable(integrity)).toBe(false);
    });

    test('zero + CHANGED identity: NOT provably empty, and NOT restorable either — the case that used to contradict', async () => {
        // The exact specimen: the capture block refuses the emptiness claim while the bundle still
        // holds no rows. Both statements are true, and neither is the other's negation. Before the
        // rename these were `empty=false` and `status="empty"` in one file — one word, two meanings.
        const {integrity, capture} = await buildMeta({rows: 0, currentId: 'kb-id-new', previousId: 'kb-id-old'});

        expect(capture.sources.kb.lineage).toBe('changed');
        expect(capture.sources.kb.provenEmpty).toBe(false);
        expect(integrity[0].status).toBe('empty');
        // Load-bearing: lineage must NOT soften the recovery verdict. A zero-row bundle over a
        // replaced source is the most suspicious specimen there is; promoting it to restorable would
        // be a false green delivered by the very field added to prevent one.
        expect(isBundleRestorable(integrity)).toBe(false);
    });

    test('zero + UNKNOWN identity (first run): NOT provably empty, NOT restorable', async () => {
        const {integrity, capture} = await buildMeta({rows: 0, currentId: 'kb-id', previousId: null});

        expect(capture.sources.kb.lineage).toBe('unknown');
        expect(capture.sources.kb.provenEmpty).toBe(false);
        expect(isBundleRestorable(integrity)).toBe(false);
    });

    test('POSITIVE CONTROL — positive rows: not empty, and restorable', async () => {
        // Without this, every assertion above passes for a build that hard-codes `false`.
        const {integrity, capture} = await buildMeta({rows: 3, currentId: 'kb-id', previousId: 'kb-id'});

        expect(capture.sources.kb.rowState).toBe('populated');
        expect(capture.sources.kb.provenEmpty).toBe(false);
        expect(integrity[0].status).toBe('pass');
        expect(isBundleRestorable(integrity)).toBe(true);
        expect(emptySubsystems(integrity)).toEqual([]);
    });

    test('a LEGACY bundle — no capture block at all — behaves exactly as it did before', async () => {
        // Bundles already on disk carry no capture block. Nothing about this change may reach them:
        // still named, still disqualifying, no crash on the absent block.
        const legacy = [{subsystem: 'kb', status: 'empty', sourceCount: 0, bundleCount: 0}];

        expect(emptySubsystems(legacy)).toEqual(['kb']);
        expect(isBundleRestorable(legacy)).toBe(false);
        expect(summarizeBundleIntegrity(legacy)).toEqual({emptySubsystems: ['kb'], restorable: false});
    });

    test('an ABSENT integrity block stays UNKNOWN — absence is a third answer, not a quiet false', async () => {
        expect(isBundleRestorable(undefined)).toBeNull();
        expect(summarizeBundleIntegrity(undefined)).toEqual({emptySubsystems: [], restorable: null});
    });

    test('MIXED Memory Core: one re-embedded collection does not carry its sibling\'s verdict', async () => {
        const capture = await buildCaptureBlock({
            subsystems: {
                mc: {
                    memories : {count: 0, collectionId: 'mem-id'},        // same identity → genuinely empty
                    summaries: {count: 0, collectionId: 'sum-id-new'}     // re-embedded → unprovable
                }
            },
            backupRoot: root
        });

        // No predecessor exists under `root`, so both degrade to unknown and NEITHER claims empty —
        // the honest first-run state, asserted here so the mixed case cannot silently become uniform.
        expect(capture.sources['mc.memories'].provenEmpty).toBe(false);
        expect(capture.sources['mc.summaries'].provenEmpty).toBe(false);
        expect(capture.sources['mc.memories'].collectionId).toBe('mem-id');
        expect(capture.sources['mc.summaries'].collectionId).toBe('sum-id-new');
    });

    test('the bare property `empty` exists in NEITHER block — one word, one owner', async () => {
        // The mechanical form of the repair. `integrity` owns the token as a status VALUE; the
        // provenance claim is a property named for what it proves. Neither block publishes a bare
        // `empty` key, so no reader can pick one up and assume the other's meaning.
        const {integrity, capture} = await buildMeta({rows: 0, currentId: 'kb-id', previousId: 'kb-id'});

        expect(integrity[0]).not.toHaveProperty('empty');
        expect(capture.sources.kb).not.toHaveProperty('empty');
        expect(capture.sources.kb).toHaveProperty('provenEmpty');
        expect(integrity[0].status).toBe('empty');
    });

    /**
     * The version axis. Every spec above reads a bundle with the reader that wrote it, and the
     * defect this describe block exists to prevent was invisible to all of them: a rename of the
     * status token left old-reader + new-bundle returning `restorable: true` for a bundle holding
     * nothing, while old/old, new/old and new/new all stayed correct. Three of four cells green.
     *
     * Compatibility here is one-directional by construction. A reader we ship can be taught to accept
     * yesterday's tokens; a reader already running on a plane four figures of commits behind can never
     * be taught tomorrow's — it matches what it knows and silently drops the rest, which for this
     * field resolves to "no zero-row subsystem found".
     */
    test.describe('cross-version: a bundle written today must disqualify under a reader shipped before it', () => {
        /**
         * A reader frozen at the previous contract, spelled out rather than imported so it cannot
         * drift when the live one changes. This IS the deployed population.
         * @param {Array<Object>} integrity
         * @returns {Boolean} The old contract's restorability verdict.
         */
        const oldReaderSaysRestorable = integrity =>
            integrity.filter(check => check?.status === 'empty').length === 0;

        test('WITNESS: oldReader(newBundle) === false', async () => {
            const {integrity} = await buildMeta({rows: 0, currentId: 'kb-id', previousId: 'kb-id'});

            expect(oldReaderSaysRestorable(integrity)).toBe(false);
            expect(isBundleRestorable(integrity)).toBe(false);
        });

        test('POSITIVE CONTROL: the old reader still says TRUE for a genuinely restorable new bundle', async () => {
            // Without this the witness passes for a reader hard-coded to `false`.
            const {integrity} = await buildMeta({rows: 3, currentId: 'kb-id', previousId: 'kb-id'});

            expect(oldReaderSaysRestorable(integrity)).toBe(true);
            expect(isBundleRestorable(integrity)).toBe(true);
        });

        test('the writer emits ONLY tokens the frozen wire vocabulary declares', async () => {
            // The structural guard. A new status value cannot be introduced without this failing,
            // which is the only place the one-directional compatibility can be enforced at all —
            // by the writer, since the readers are already deployed and cannot be changed.
            const known = new Set(Object.values(INTEGRITY_STATUS));

            for (const rows of [0, 3]) {
                const {integrity} = await buildMeta({rows, currentId: 'kb-id', previousId: 'kb-id'});

                for (const check of integrity) {
                    expect(known, `rows=${rows} emitted an undeclared status: ${check.status}`)
                        .toContain(check.status);
                }
            }

            expect(Object.isFrozen(INTEGRITY_STATUS)).toBe(true);
            expect([...known].sort()).toEqual(['empty', 'fail', 'pass', 'skipped']);
        });
    });
});
