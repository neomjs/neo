import {setup} from '../../../setup.mjs';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import path           from 'path';

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

    test.beforeAll(async () => {
        SDK                   = await import('../../../../../ai/services.mjs');
        ({runBackup}          = await import('../../../../../buildScripts/ai/backup.mjs'));
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
});
