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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import path           from 'path';

// Serial mode: this file mutates KB + MC singleton collection accessors across
// beforeAll/afterAll. Serial ordering within this file prevents local multi-worker
// races. CI runs workers:1 (see playwright.config.unit.mjs) so this is local-DX only.
test.describe.configure({mode: 'serial'});

test.describe('backup.mjs orchestrator — atomic bundle assembly (#10129 Phase 2)', () => {
    let SDK, runBackup;
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

    test.beforeAll(async () => {
        SDK                   = await import('../../../../../../ai/services.mjs');
        ({runBackup, verifyBundleIntegrity} = await import('../../../../../../ai/scripts/maintenance/backup.mjs'));
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

    test('produces a bundle with all 5 subfolders and routes populated subsystems into their JSONL slots', async () => {
        const silentLogger = {log: () => {}, error: () => {}};

        const result = await runBackup({
            bundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger: silentLogger
        });

        expect(result.bundleRoot).toBe(bundleRoot);

        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            expect(fs.existsSync(path.join(bundleRoot, sub))).toBe(true);
        }

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

        // graph subfolder exists but GraphService.db is not wired in unit-test mode,
        // so no graph-backup file is emitted. This is the documented "source has no data"
        // branch per ticket AC ("non-empty content when the source subsystems have data").
    });

    test('reports missing concept/trajectory sources as non-fatal notes', async () => {
        const silentLogger = {log: () => {}, error: () => {}};
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
            bundleRoot            : altBundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            sentToCullSourceFile  : sentToCullSource,
            logger                : silentLogger
        });

        expect(fs.existsSync(path.join(altBundleRoot, 'mailbox'))).toBe(true);
        expect(fs.readdirSync(path.join(altBundleRoot, 'mailbox'))).toEqual(['sent-to-cull.jsonl']);
        expect(result.subsystems.mailbox.copied).toBe(1);
    });

    test('writes bundle-meta.json with bundleVersion/timestamp/completedAt/topology/integrity/version (#10871)', async () => {
        const silentLogger  = {log: () => {}, error: () => {}};
        const altBundleRoot = path.join(workRoot, 'bundle-meta-schema');

        await runBackup({
            bundleRoot            : altBundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            sentToCullSourceFile  : path.join(workRoot, 'does-not-exist-cull.jsonl'),
            logger                : silentLogger
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
});
