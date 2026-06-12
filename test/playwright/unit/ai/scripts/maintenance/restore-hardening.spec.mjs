import {setup} from '../../../../setup.mjs';

const appName = 'RestoreHardeningTest';

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

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../src/core/_export.mjs';
import InstanceManager  from '../../../../../../src/manager/Instance.mjs';
import {execFile}       from 'child_process';
import fs               from 'fs';
import fsExtra          from 'fs-extra';
import os               from 'os';
import path             from 'path';
import {fileURLToPath}  from 'url';
import {promisify}      from 'util';

const execFileAsync = promisify(execFile);
const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);

/**
 * #11150 — Production-scale restore hardening regression tests.
 *
 * The 2026-05-10 graph + Chroma recovery surfaced 3 bugs that hid until real-world
 * backup data exercised them. Each test below pins the empirical anchor that drove
 * the corresponding fix in #11151.
 *
 * 1. **Bootstrap regression** (`restore.mjs` Neo namespace): fresh-process spawn
 *    must not throw `ReferenceError: Neo is not defined` from `Compare.mjs:166`.
 * 2. **Streaming validateBundle**: first-line JSONL parseability sanity check must
 *    NOT call `fs.readFile` on the full file (V8 max-string-length cap on >512MB
 *    files). Asserts the streaming path doesn't depend on full-file read.
 * 3. **Chunked Chroma upsert in `#importMemories`**: large record sets must call
 *    `collection.upsert()` in chunks of <=250 rather than one bulk call. Asserts
 *    via mocked Chroma collection that exercises the SDK boundary.
 */
test.describe.configure({mode: 'serial'});

test.describe('restore hardening regression (#11150 / #11151)', () => {

    // ─────────────────────────────────────────────────────────────────────
    // Test 1: Neo bootstrap — fresh-process spawn must not throw
    // ─────────────────────────────────────────────────────────────────────

    test('restore.mjs bootstrap: fresh node process completes Neo namespace setup before service imports', async () => {
        const repoRoot = path.resolve(__dirname, '../../../../../../');
        // Probe-run with an obviously-missing bundle path. validateBundle will fail FAST
        // with "Bundle directory not found" — but ONLY if the Neo bootstrap chain has
        // completed. If `Neo.gatekeep` ReferenceError fires (the bug this guards), the
        // process exits with stderr containing "Neo is not defined" BEFORE reaching
        // validateBundle. Asserting the err.message includes the expected validateBundle
        // error proves the bootstrap chain succeeded.
        let stderr = '';
        try {
            await execFileAsync('node', ['./ai/scripts/maintenance/restore.mjs', '/nonexistent-bundle-probe-' + Date.now()], {cwd: repoRoot});
            throw new Error('expected restore.mjs to fail on missing bundle');
        } catch (err) {
            stderr = err.stderr || err.stdout || err.message || '';
        }
        // The fix path: validateBundle runs and reports missing-bundle error.
        expect(stderr).toMatch(/Bundle directory not found|missing/i);
        // The bug surface: any "Neo is not defined" trace means the bootstrap is broken.
        expect(stderr).not.toMatch(/Neo is not defined/);
        expect(stderr).not.toMatch(/Neo\.gatekeep is not a function/);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 2: validateBundle streaming first-line read
    // ─────────────────────────────────────────────────────────────────────

    test('validateBundle: first-line JSONL parseability uses streaming readline (no full-file readFile)', async () => {
        const {validateBundle} = await import('../../../../../../ai/scripts/maintenance/restore.mjs');

        const workRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'restore-hardening-validate-'));
        const bundle = path.join(workRoot, 'bundle');
        const subdirs = ['kb', 'mc', 'graph', 'concepts', 'trajectories'];
        for (const s of subdirs) await fsExtra.ensureDir(path.join(bundle, s));
        // Plant one JSONL file per subdir
        await fsExtra.writeFile(path.join(bundle, 'kb', 'k.jsonl'), '{"id":"k1"}\n');
        await fsExtra.writeFile(path.join(bundle, 'mc', 'm.jsonl'), '{"id":"m1"}\n');
        await fsExtra.writeFile(path.join(bundle, 'graph', 'g.jsonl'), '{"type":"node","data":{"id":"g1"}}\n');
        await fsExtra.writeFile(path.join(bundle, 'concepts', 'nodes.jsonl'), '{"id":"c1"}\n');
        await fsExtra.writeFile(path.join(bundle, 'trajectories', 'trajectories.jsonl'), '{"x":1}\n');

        // Spy on fs-extra.readFile — assert it is NOT called for the JSONL parseability
        // sanity check (the bug path that overflows V8 string cap on >512MB files).
        const fsExtraMod = await import('fs-extra');
        const realReadFile = fsExtraMod.default.readFile;
        const readFileCalls = [];
        fsExtraMod.default.readFile = function (...args) {
            readFileCalls.push(args[0]);
            return realReadFile.apply(this, args);
        };

        try {
            const layout = {
                kb: path.join(bundle, 'kb'),
                mc: path.join(bundle, 'mc'),
                graph: path.join(bundle, 'graph'),
                concepts: path.join(bundle, 'concepts'),
                trajectories: path.join(bundle, 'trajectories'),
                mailbox: path.join(bundle, 'mailbox')
            };
            await validateBundle(bundle, layout, {log: () => {}, warn: () => {}});

            // The bug shape: full-file readFile of any *.jsonl file. The fix uses streaming
            // readline. So no JSONL files should appear in readFile call list.
            const jsonlReadFileCalls = readFileCalls.filter(f => String(f).endsWith('.jsonl'));
            expect(jsonlReadFileCalls).toEqual([]);
        } finally {
            fsExtraMod.default.readFile = realReadFile;
            await fsExtra.remove(workRoot);
        }
    });

    // ─────────────────────────────────────────────────────────────────────
    // Test 3: Chunked Chroma upsert in #importMemories
    // ─────────────────────────────────────────────────────────────────────

    test('#importMemories chunks Chroma write calls for large record sets (#11144: merge=add, replace=upsert)', async () => {
        // Black-box the chunking via the public manageDatabaseBackup({action:'import'})
        // surface. Mock the Memory_StorageRouter.getMemoryCollection to return a fake
        // collection with add + get spies; record per-call record-count, assert chunked.
        //
        // #11144 changed merge-mode's Chroma primitive from `upsert()` to a preflight
        // `get({ids})` existence check + `add()` for missing-only IDs. With no live
        // records, every backup ID is "missing" → 1000 records still chunk into 4
        // chunks of 250 (same CHROMA_UPSERT_CHUNK_SIZE budget). Also assert the
        // existence-preflight is chunked at the same boundary.
        const SDK = await import('../../../../../../ai/services.mjs');
        const Memory_DatabaseService = SDK.Memory_DatabaseService;
        const Memory_StorageRouter   = SDK.Memory_StorageRouter;

        const addCalls    = [];
        const getCalls    = [];
        const mockCollection = {
            name: 'neo-agent-memory',
            get   : async ({ids}) => { getCalls.push(ids.length); return {ids: []}; },
            add   : async ({ids}) => { addCalls.push(ids.length); },
            upsert: async ({ids}) => { addCalls.push(ids.length); } // replace-mode path safety
        };
        const originalGetMemColl = Memory_StorageRouter.getMemoryCollection;
        const originalGetSumColl = Memory_StorageRouter.getSummaryCollection;
        Memory_StorageRouter.getMemoryCollection = async () => mockCollection;
        Memory_StorageRouter.getSummaryCollection = async () => mockCollection;

        // Build synthetic JSONL bundle dir with 1000 records (> CHROMA_UPSERT_CHUNK_SIZE
        // of 250 → expect ⌈1000/250⌉ = 4 add() calls + 4 get() preflight calls).
        const workRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'restore-hardening-chunk-'));
        const mcDir   = path.join(workRoot, 'mc-import');
        await fsExtra.ensureDir(mcDir);
        const lines = [];
        for (let i = 0; i < 1000; i++) {
            lines.push(JSON.stringify({
                id       : `m-${i}`,
                embedding: [0.1 + i * 0.0001],
                metadata : {idx: i},
                document : `doc-${i}`
            }));
        }
        await fsExtra.writeFile(path.join(mcDir, 'memory-backup-test.jsonl'), lines.join('\n') + '\n');

        try {
            await Memory_DatabaseService.manageDatabaseBackup({
                action: 'import',
                file  : mcDir,
                mode  : 'merge'
            });

            // Assert chunking on the merge-mode add() path: each call <= 250,
            // total records 1000, exactly 4 calls.
            expect(addCalls.length).toBe(4);
            expect(addCalls.reduce((a, b) => a + b, 0)).toBe(1000);
            for (const callSize of addCalls) {
                expect(callSize).toBeLessThanOrEqual(250);
            }
            // Existence preflight also chunked at the same boundary.
            expect(getCalls.length).toBe(4);
            for (const callSize of getCalls) {
                expect(callSize).toBeLessThanOrEqual(250);
            }
        } finally {
            Memory_StorageRouter.getMemoryCollection = originalGetMemColl;
            Memory_StorageRouter.getSummaryCollection = originalGetSumColl;
            await fsExtra.remove(workRoot);
        }
    });
});
