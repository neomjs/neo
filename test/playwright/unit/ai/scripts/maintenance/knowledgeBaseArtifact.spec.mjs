import {setup} from '../../../../setup.mjs';

const appName = 'KnowledgeBaseArtifactTest';

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
import fs             from 'fs';
import fsExtra        from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {execFile}     from 'child_process';
import {promisify}    from 'util';

const execFileAsync = promisify(execFile);

/** Extracts a real release zip so an assertion can read the bytes an adopter actually receives. */
const unzipTo = (zipPath, targetDir) => execFileAsync('unzip', ['-o', '-q', zipPath, '-d', targetDir]);

/** Rebuilds a flat release zip from explicit member paths (mirrors the upload script's `zip -j`). */
const zipFlat = (zipPath, members) => execFileAsync('zip', ['-j', '-q', zipPath, ...members]);

// Serial mode: upload/download specs swap real KB SDK singleton methods via seams indirectly;
// keep file-local ordering deterministic for local multi-worker runs. CI uses workers:1.
test.describe.configure({mode: 'serial'});

test.describe('Knowledge Base release artifact — collection-scoped contract (#12157)', () => {
    let assertCollectionScopedArtifact, ARTIFACT_BASENAME, ARTIFACT_META_FILENAME, KB_BACKUP_FILE_PREFIX;
    let ARTIFACT_VECTORS_FILENAME, ARTIFACT_SCHEMA_VERSION, packVectorsFp16, unpackVectorsFp16, recordOrderDigest;
    let shortestFp16Decimal;
    let packArtifactToV2, rehydrateArtifactFromV2, resolveSingleArtifactJsonl, ARTIFACT_VECTOR_BYTE_ORDER;
    let uploadKnowledgeBase, downloadKnowledgeBase;
    let workRoot;

    const silentLogger = {log: () => {}, warn: () => {}, error: () => {}};

    /** A KB SDK seam that records its calls and returns a configurable shape. */
    const makeDatabaseServiceSeam = ({onExport, onImport, importResult} = {}) => {
        const calls = [];
        return {
            calls,
            manageDatabaseBackup: async ({action, ...rest}) => {
                calls.push({action, ...rest});
                if (action === 'export') {
                    await onExport?.({action, ...rest});
                    return {message: 'export ok'};
                }
                if (action === 'import') {
                    // `onImport` observes the extract dir AS THE SDK SEES IT. The workflow deletes that
                    // dir in its finally block, so this is the only point where the bytes the real
                    // importer would consume can be asserted on.
                    await onImport?.({action, ...rest});
                    return importResult ?? {message: 'import ok', imported: 0, mode: rest.mode};
                }
                throw new Error(`unexpected action ${action}`);
            }
        };
    };

    const readyLifecycleSeam = () => ({ready: async () => {}});

    /**
     * Fixture vector width. Deliberately tiny — the real corpus is dim 4096, but the wiring under test
     * is dimension-agnostic and a 4096-wide fixture would only make the spec slow and unreadable.
     */
    const FIXTURE_DIMENSION = 4;

    /** fp16-exact values, so a round-trip assertion can be exact rather than tolerance-based. */
    const fixtureVector = seed => [seed, seed + 0.5, -seed, 0.25];

    /** A v1-shaped KB export: one record per line, embeddings inline as decimal text. */
    const jsonlFixture = ids => ids
        .map((id, index) => JSON.stringify({
            id,
            embedding: fixtureVector(index + 1),
            metadata : {content: `content-${id}`},
            document : null
        }))
        .join('\n') + '\n';

    /** Reads the KB JSONL out of an artifact directory as parsed records. */
    const readArtifactRecords = artifactDir => {
        const name = fs.readdirSync(artifactDir).find(entry => entry.startsWith(KB_BACKUP_FILE_PREFIX) && entry.endsWith('.jsonl'));

        return fs.readFileSync(path.join(artifactDir, name), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    };

    /**
     * Builds a REAL release zip through `uploadKnowledgeBase` and returns its bytes plus a fetch seam
     * serving them. Exercising the actual build path means the download assertions cannot pass against
     * a hand-stubbed extract dir that the shipped pipeline would never produce.
     */
    const buildServedArtifact = async ({label, ids, dimension = FIXTURE_DIMENSION, mutateStage}) => {
        const stageRoot   = path.join(workRoot, `${label}-stage`),
              releaseRoot = path.join(workRoot, `${label}-release`);

        await fsExtra.ensureDir(stageRoot);
        await fsExtra.ensureDir(releaseRoot);

        const built = await uploadKnowledgeBase({
            tagName        : '99.0.0',
            databaseService: makeDatabaseServiceSeam({
                onExport: async ({backupPath}) => {
                    fs.writeFileSync(path.join(backupPath, `${KB_BACKUP_FILE_PREFIX}${label}.jsonl`), jsonlFixture(ids));
                }
            }),
            lifecycleService   : readyLifecycleSeam(),
            embeddingConfig    : {embeddingProvider: 'openAiCompatible', vectorDimension: dimension},
            knowledgeBaseConfig: {collectionName: 'neo-knowledge-base'},
            runGh              : async () => {},
            skipReleaseCheck   : true,
            skipUpload         : true,
            stageRoot,
            logger             : silentLogger
        });

        // `skipUpload` retains the artifact at the repo root (the upload path cleans itself), so move it
        // to the test's own tree immediately — a spec must not leave an untracked release asset behind.
        const servedZip = path.join(releaseRoot, ARTIFACT_BASENAME);
        fs.copyFileSync(built.artifactPath, servedZip);
        fs.rmSync(built.artifactPath, {force: true});

        await mutateStage?.({servedZip, releaseRoot});

        const zipBytes = fs.readFileSync(servedZip);

        return {
            built,
            servedZip,
            fetchImpl: async () => ({
                ok         : true,
                status     : 200,
                arrayBuffer: async () => zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength)
            })
        }
    };

    test.beforeAll(async () => {
        ({
            assertCollectionScopedArtifact,
            ARTIFACT_BASENAME,
            ARTIFACT_META_FILENAME,
            KB_BACKUP_FILE_PREFIX,
            ARTIFACT_VECTORS_FILENAME,
            ARTIFACT_SCHEMA_VERSION,
            packVectorsFp16,
            unpackVectorsFp16,
            recordOrderDigest,
            packArtifactToV2,
            rehydrateArtifactFromV2,
            resolveSingleArtifactJsonl,
            shortestFp16Decimal,
            ARTIFACT_VECTOR_BYTE_ORDER
        } = await import('../../../../../../ai/scripts/maintenance/knowledgeBaseArtifact.mjs'));

        ({uploadKnowledgeBase}   = await import('../../../../../../ai/scripts/maintenance/uploadKnowledgeBase.mjs'));
        ({downloadKnowledgeBase} = await import('../../../../../../ai/scripts/maintenance/downloadKnowledgeBase.mjs'));

        workRoot = path.resolve(process.cwd(), 'tmp', `kb-artifact-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});
    });

    test.afterAll(() => {
        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    // ───────── assertCollectionScopedArtifact: the no-MC-leak guard ─────────

    test('canonical asset name is reconciled to a single constant', () => {
        expect(ARTIFACT_BASENAME).toBe('chroma-neo-knowledge-base.zip');
    });

    test('accepts a clean KB-only artifact (JSONL export + meta sidecar)', async () => {
        const dir = path.join(workRoot, 'clean');
        await fsExtra.ensureDir(dir);
        fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}2026-01-01.jsonl`), '{"id":"kb-1"}\n');
        fs.writeFileSync(path.join(dir, ARTIFACT_META_FILENAME), '{"collection":"neo-knowledge-base"}');

        const result = await assertCollectionScopedArtifact({artifactDir: dir});
        expect(result.jsonlFiles).toEqual([`${KB_BACKUP_FILE_PREFIX}2026-01-01.jsonl`]);
    });

    // ───────── schema v2: packed fp16 vectors ─────────

    test('the packed-vector sidecar is permitted — and the allowlist stayed EXACT, not pattern-shaped', async () => {
        const dir = path.join(workRoot, 'v2-clean');
        await fsExtra.ensureDir(dir);
        fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}2026-01-01.jsonl`), '{"id":"kb-1"}\n');
        fs.writeFileSync(path.join(dir, ARTIFACT_META_FILENAME), '{"collection":"neo-knowledge-base"}');
        fs.writeFileSync(path.join(dir, ARTIFACT_VECTORS_FILENAME), Buffer.alloc(4));

        await expect(assertCollectionScopedArtifact({artifactDir: dir})).resolves.toBeTruthy();

        // The guard is the privacy invariant keeping Memory Core exports out of a PUBLIC asset.
        // Widening it to `*.bin` would trade that guarantee for one file's convenience, so a
        // differently-named binary must still be refused.
        fs.writeFileSync(path.join(dir, 'kb-vectors-fp32.bin'), Buffer.alloc(4));
        await expect(assertCollectionScopedArtifact({artifactDir: dir}))
            .rejects.toThrow(/unexpected entry 'kb-vectors-fp32\.bin'/);
    });

    test('fp16 pack/unpack round-trips vectors row-for-row', () => {
        const dimension = 4,
              vectors   = [[0.5, -0.25, 0.125, 0], [1, 0.5, 0.25, -1]],
              packed    = packVectorsFp16(vectors, dimension);

        // 2 rows × 4 dims × 2 bytes — the size the metadata-driven decode asserts against.
        expect(packed.byteLength).toBe(2 * dimension * 2);

        const out = unpackVectorsFp16({buffer: packed, recordCount: 2, dimension});

        expect(out).toHaveLength(2);
        // These values are all exactly representable in fp16, so the round-trip is bit-exact here.
        // The lossy general case is covered by a corpus-wide recall measurement recorded on the
        // originating ticket (100% recall@10, 99.983% recall@50 against fp32), not by this spec.
        expect(Array.from(out[0])).toEqual(vectors[0]);
        expect(Array.from(out[1])).toEqual(vectors[1]);
    });

    test('a mis-sized row is refused at pack time rather than shifting every later vector', () => {
        expect(() => packVectorsFp16([[1, 2, 3, 4], [1, 2, 3]], 4))
            .toThrow(/row 1 has length 3, expected 4/);
    });

    test('a truncated sidecar fails loud instead of decoding garbage', () => {
        const packed = packVectorsFp16([[1, 2], [3, 4]], 2);

        expect(() => unpackVectorsFp16({buffer: packed.subarray(0, 6), recordCount: 2, dimension: 2}))
            .toThrow(/is 6 bytes, expected 8/);
    });

    test('the order digest detects a REORDERED jsonl — the failure no byte-length check can see', () => {
        const ids = ['a', 'b', 'c'];

        // Same ids, same count, same buffer size — only the pairing changed. v2 re-attaches vectors
        // by INDEX, so a permutation silently mates every row with the wrong embedding.
        expect(recordOrderDigest(ids)).toBe(recordOrderDigest(['a', 'b', 'c']));
        expect(recordOrderDigest(ids)).not.toBe(recordOrderDigest(['a', 'c', 'b']));
        expect(recordOrderDigest(ids)).not.toBe(recordOrderDigest(['a', 'b']));
    });

    test('schema version is pinned so a v1 consumer cannot silently read a v2 artifact', () => {
        expect(ARTIFACT_SCHEMA_VERSION).toBe(2);
        expect(ARTIFACT_VECTORS_FILENAME).toBe('kb-vectors-fp16.bin');
    });

    test('rejects a Memory Core memory collection leak', async () => {
        const dir = path.join(workRoot, 'leak-memory');
        await fsExtra.ensureDir(dir);
        fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}2026-01-01.jsonl`), '{"id":"kb-1"}\n');
        fs.writeFileSync(path.join(dir, 'neo-agent-memory-backup-2026-01-01.jsonl'), '{"id":"mem-1"}\n');

        await expect(assertCollectionScopedArtifact({artifactDir: dir}))
            .rejects.toThrow(/Memory Core collection 'neo-agent-memory'/);
    });

    test('rejects a Memory Core sessions + native-graph collection leak', async () => {
        for (const leak of ['neo-agent-sessions-backup.jsonl', 'neo-native-graph-backup.jsonl']) {
            const dir = path.join(workRoot, `leak-${leak}`);
            await fsExtra.ensureDir(dir);
            fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}x.jsonl`), '{"id":"kb"}\n');
            fs.writeFileSync(path.join(dir, leak), '{"id":"x"}\n');
            await expect(assertCollectionScopedArtifact({artifactDir: dir}))
                .rejects.toThrow(/Artifact scope violation/);
        }
    });

    test('rejects a sqlite/ payload (graph store)', async () => {
        const dir = path.join(workRoot, 'leak-sqlite-dir');
        await fsExtra.ensureDir(path.join(dir, 'sqlite'));
        fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}x.jsonl`), '{"id":"kb"}\n');

        await expect(assertCollectionScopedArtifact({artifactDir: dir}))
            .rejects.toThrow(/SQLite payload/);
    });

    test('rejects a loose *.sqlite file', async () => {
        const dir = path.join(workRoot, 'leak-sqlite-file');
        await fsExtra.ensureDir(dir);
        fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}x.jsonl`), '{"id":"kb"}\n');
        fs.writeFileSync(path.join(dir, 'memory-core-graph.sqlite'), 'binary');

        await expect(assertCollectionScopedArtifact({artifactDir: dir}))
            .rejects.toThrow(/SQLite payload/);
    });

    test('rejects an unexpected non-KB JSONL export', async () => {
        const dir = path.join(workRoot, 'leak-unexpected-jsonl');
        await fsExtra.ensureDir(dir);
        fs.writeFileSync(path.join(dir, 'something-else.jsonl'), '{"id":"x"}\n');

        await expect(assertCollectionScopedArtifact({artifactDir: dir}))
            .rejects.toThrow(/unexpected JSONL export/);
    });

    test('rejects an artifact with no KB export at all', async () => {
        const dir = path.join(workRoot, 'leak-empty');
        await fsExtra.ensureDir(dir);
        fs.writeFileSync(path.join(dir, ARTIFACT_META_FILENAME), '{}');

        await expect(assertCollectionScopedArtifact({artifactDir: dir}))
            .rejects.toThrow(/no '.*' Knowledge Base export found/);
    });

    // ───────── uploadKnowledgeBase: collection-scoped staging ─────────

    test('upload stages ONLY the KB collection + a provenance meta, then asserts scope', async () => {
        const stageRoot = path.join(workRoot, 'upload-stage-clean');
        await fsExtra.ensureDir(stageRoot);

        // Export seam writes a single KB JSONL into the staging dir the SDK was handed. Records carry
        // `dimension`-length embeddings because the v2 pack step refuses a partially-vectorised
        // artifact — shipping rows whose vectors are missing is the failure it exists to catch.
        const databaseService = makeDatabaseServiceSeam({
            onExport: async ({backupPath}) => {
                fs.writeFileSync(path.join(backupPath, `${KB_BACKUP_FILE_PREFIX}2026-05-29.jsonl`), jsonlFixture(['kb-1', 'kb-2']));
            }
        });

        const ghCalls = [];
        const result  = await uploadKnowledgeBase({
            tagName            : '99.0.0',
            databaseService,
            lifecycleService   : readyLifecycleSeam(),
            embeddingConfig    : {embeddingProvider: 'openAiCompatible', vectorDimension: FIXTURE_DIMENSION},
            knowledgeBaseConfig: {collectionName: 'neo-knowledge-base'},
            runGh              : async (args) => { ghCalls.push(args); },
            stageRoot,
            logger             : silentLogger
        });

        expect(result.recordCount).toBe(2);
        expect(result.embeddingProvider).toBe('openAiCompatible');
        expect(result.dimension).toBe(FIXTURE_DIMENSION);
        expect(result.artifactName).toBe('chroma-neo-knowledge-base.zip');

        // Export was requested; upload was attempted (release-check + upload gh calls).
        expect(databaseService.calls[0].action).toBe('export');
        expect(ghCalls.some(a => a[0] === 'release' && a[1] === 'upload')).toBe(true);

        // The staging dir is cleaned up in finally; the local artifact too.
        expect(fs.existsSync(result.artifactPath)).toBe(false);
    });

    test('upload fails fast when the export yields zero records', async () => {
        const stageRoot = path.join(workRoot, 'upload-stage-empty');
        await fsExtra.ensureDir(stageRoot);

        const databaseService = makeDatabaseServiceSeam({
            onExport: async ({backupPath}) => {
                fs.writeFileSync(path.join(backupPath, `${KB_BACKUP_FILE_PREFIX}empty.jsonl`), '');
            }
        });

        await expect(uploadKnowledgeBase({
            tagName            : '99.0.0',
            databaseService,
            lifecycleService   : readyLifecycleSeam(),
            embeddingConfig    : {embeddingProvider: 'openAiCompatible', vectorDimension: 4096},
            knowledgeBaseConfig: {collectionName: 'neo-knowledge-base'},
            runGh              : async () => {},
            skipReleaseCheck   : true,
            stageRoot,
            logger             : silentLogger
        })).rejects.toThrow(/exported 0 records/);
    });

    // ───────── downloadKnowledgeBase: merge-only contract ─────────

    test('download skips entirely when the consumer KB collection is already populated', async () => {
        const databaseService = makeDatabaseServiceSeam({});
        const fetchCalls      = [];

        const result = await downloadKnowledgeBase({
            tagName         : '99.0.0',
            chromaManager   : {getKnowledgeBaseCollection: async () => ({count: async () => 42})},
            databaseService,
            lifecycleService: readyLifecycleSeam(),
            embeddingConfig : {embeddingProvider: 'openAiCompatible', vectorDimension: 4096},
            fetchImpl       : async (url) => { fetchCalls.push(url); return {ok: false, status: 404}; },
            workRoot        : path.join(workRoot, 'dl-populated'),
            logger          : silentLogger
        });

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('collection-populated');
        // Merge-only guard means NO network call and NO import when already populated.
        expect(fetchCalls.length).toBe(0);
        expect(databaseService.calls.length).toBe(0);
    });

    test('download soft-fails (no throw) on a 404 artifact for empty consumer collection', async () => {
        const databaseService = makeDatabaseServiceSeam({});

        const result = await downloadKnowledgeBase({
            tagName         : '99.0.0',
            chromaManager   : {getKnowledgeBaseCollection: async () => ({count: async () => 0})},
            databaseService,
            lifecycleService: readyLifecycleSeam(),
            embeddingConfig : {embeddingProvider: 'openAiCompatible', vectorDimension: 4096},
            fetchImpl       : async () => ({ok: false, status: 404}),
            workRoot        : path.join(workRoot, 'dl-404'),
            logger          : silentLogger
        });

        expect(result.status).toBe('absent');
        expect(databaseService.calls.length).toBe(0);
    });

    test('download imports collection-scoped (merge) when the artifact round-trips a real zip', async () => {
        // Build a real artifact via uploadKnowledgeBase(skipUpload) so the download path exercises
        // the REAL zip → unzip → assert → rehydrate → import chain, not a stubbed extract dir.
        const {fetchImpl} = await buildServedArtifact({label: 'roundtrip', ids: ['kb-1']});

        const downloadDbSeam = makeDatabaseServiceSeam({importResult: {message: 'ok', imported: 1, mode: 'merge'}});

        const result = await downloadKnowledgeBase({
            tagName         : '99.0.0',
            chromaManager   : {getKnowledgeBaseCollection: async () => ({count: async () => 0})},
            databaseService : downloadDbSeam,
            lifecycleService: readyLifecycleSeam(),
            embeddingConfig : {embeddingProvider: 'openAiCompatible', vectorDimension: FIXTURE_DIMENSION},
            fetchImpl,
            workRoot        : path.join(workRoot, 'dl-roundtrip'),
            logger          : silentLogger
        });

        expect(result.status).toBe('imported');
        expect(result.imported).toBe(1);

        const importCall = downloadDbSeam.calls.find(c => c.action === 'import');
        expect(importCall.mode).toBe('merge');
        // The SDK is handed the unzipped extract DIRECTORY (collection-scoped import), never
        // the `.zip` artifact and never the user's `.neo-ai-data` data dir. (The dir itself is
        // cleaned up in the workflow's finally block, so we assert on the path shape.)
        expect(path.basename(importCall.file)).toBe('extract');
        expect(importCall.file.endsWith('.zip')).toBe(false);
        expect(importCall.file).not.toContain('.neo-ai-data');
    });

    // ───────── schema v2 wiring: the build side EMITS it, the consume side DECODES it ─────────

    test('the shipped zip carries the fp16 sidecar and a JSONL stripped of embeddings', async () => {
        const {servedZip} = await buildServedArtifact({label: 'emit-v2', ids: ['kb-1', 'kb-2', 'kb-3']});
        const unpackDir   = path.join(workRoot, 'emit-v2-unpacked');

        await fsExtra.ensureDir(unpackDir);
        await unzipTo(servedZip, unpackDir);

        // Three entries, and the vectors are the BINARY one — not decimal text inside the JSONL.
        const entries = fs.readdirSync(unpackDir).sort();
        expect(entries).toContain(ARTIFACT_VECTORS_FILENAME);
        expect(entries).toContain(ARTIFACT_META_FILENAME);
        expect(entries.filter(entry => entry.endsWith('.jsonl'))).toHaveLength(1);

        const records = readArtifactRecords(unpackDir);
        expect(records).toHaveLength(3);
        // The whole point of v2: no row carries `embedding` as text any more…
        records.forEach(record => expect(record).not.toHaveProperty('embedding'));
        // …but nothing else was dropped, so the import still gets full records.
        expect(records[0].metadata.content).toBe('content-kb-1');

        // …and the sidecar is exactly rows × dims × 2 bytes, the size the consumer asserts against.
        expect(fs.statSync(path.join(unpackDir, ARTIFACT_VECTORS_FILENAME)).size).toBe(3 * FIXTURE_DIMENSION * 2);

        const meta = JSON.parse(fs.readFileSync(path.join(unpackDir, ARTIFACT_META_FILENAME), 'utf8'));
        expect(meta.artifactVersion).toBe(ARTIFACT_SCHEMA_VERSION);
        expect(meta.vectorEncoding).toBe('fp16');
        expect(meta.recordCount).toBe(3);
        // The order digest must be stamped, or the consumer cannot prove the positional pairing.
        expect(meta.vectorDigest).toBe(recordOrderDigest(['kb-1', 'kb-2', 'kb-3']));
    });

    test('the consumer re-attaches the packed vectors BEFORE the import sees the JSONL', async () => {
        const {fetchImpl} = await buildServedArtifact({label: 'decode-v2', ids: ['kb-1', 'kb-2']});

        let observed;
        const downloadDbSeam = makeDatabaseServiceSeam({
            importResult: {message: 'ok', imported: 2, mode: 'merge'},
            onImport    : async ({file}) => {
                observed = {records: readArtifactRecords(file), entries: fs.readdirSync(file)};
            }
        });

        const result = await downloadKnowledgeBase({
            tagName         : '99.0.0',
            chromaManager   : {getKnowledgeBaseCollection: async () => ({count: async () => 0})},
            databaseService : downloadDbSeam,
            lifecycleService: readyLifecycleSeam(),
            embeddingConfig : {embeddingProvider: 'openAiCompatible', vectorDimension: FIXTURE_DIMENSION},
            fetchImpl,
            workRoot        : path.join(workRoot, 'dl-decode-v2'),
            logger          : silentLogger
        });

        expect(result.status).toBe('imported');

        // This is the load-bearing assertion of the whole wiring: the importer receives rows with
        // embeddings INLINE, so the SDK boundary keeps consuming one JSONL shape and no adopter
        // re-embeds the corpus on boot. The fixture values are fp16-exact, so this is exact.
        expect(observed.records.map(record => record.embedding)).toEqual([fixtureVector(1), fixtureVector(2)]);
        expect(observed.records[1].metadata.content).toBe('content-kb-2');

        // The sidecar is consumed, not left behind — a retained sidecar would let a re-run
        // double-rehydrate an already-inline JSONL.
        expect(observed.entries).not.toContain(ARTIFACT_VECTORS_FILENAME);
    });

    test('a v1 artifact (embeddings inline, no sidecar) still imports unchanged', async () => {
        // Backward compatibility is the reason the rehydrate step is a no-op rather than a hard v2
        // requirement: releases published before schema v2 must keep installing.
        const v1Dir = path.join(workRoot, 'v1-artifact');
        const v1Zip = path.join(workRoot, 'v1-release', ARTIFACT_BASENAME);

        await fsExtra.ensureDir(v1Dir);
        await fsExtra.ensureDir(path.dirname(v1Zip));

        fs.writeFileSync(path.join(v1Dir, `${KB_BACKUP_FILE_PREFIX}v1.jsonl`), jsonlFixture(['kb-1']));
        fs.writeFileSync(path.join(v1Dir, ARTIFACT_META_FILENAME), JSON.stringify({
            artifactVersion: 1, collection: 'neo-knowledge-base', embeddingProvider: 'openAiCompatible',
            dimension      : FIXTURE_DIMENSION, recordCount: 1
        }));

        await zipFlat(v1Zip, [path.join(v1Dir, `${KB_BACKUP_FILE_PREFIX}v1.jsonl`), path.join(v1Dir, ARTIFACT_META_FILENAME)]);

        const zipBytes = fs.readFileSync(v1Zip);

        let observed;
        const downloadDbSeam = makeDatabaseServiceSeam({
            importResult: {message: 'ok', imported: 1, mode: 'merge'},
            onImport    : async ({file}) => { observed = readArtifactRecords(file); }
        });

        const result = await downloadKnowledgeBase({
            tagName         : '99.0.0',
            chromaManager   : {getKnowledgeBaseCollection: async () => ({count: async () => 0})},
            databaseService : downloadDbSeam,
            lifecycleService: readyLifecycleSeam(),
            embeddingConfig : {embeddingProvider: 'openAiCompatible', vectorDimension: FIXTURE_DIMENSION},
            fetchImpl       : async () => ({ok: true, status: 200, arrayBuffer: async () => zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength)}),
            workRoot        : path.join(workRoot, 'dl-v1'),
            logger          : silentLogger
        });

        expect(result.status).toBe('imported');
        // Untouched: the v1 embeddings reach the importer exactly as published.
        expect(observed[0].embedding).toEqual(fixtureVector(1));
    });


    // ───────── the v2 consume gate must fail CLOSED on the STAMPED contract ─────────

    /**
     * Stages a v2 artifact whose metadata can be overridden per test, so each guard is exercised
     * against an otherwise-valid artifact rather than a differently-broken one.
     */
    const stageV2 = async ({label, metaOverrides = {}, dropSidecar = false, extraJsonl = false}) => {
        const dir   = path.join(workRoot, `gate-${label}`),
              jsonl = path.join(dir, `${KB_BACKUP_FILE_PREFIX}${label}.jsonl`);

        await fsExtra.ensureDir(dir);
        fs.writeFileSync(jsonl, jsonlFixture(['kb-1', 'kb-2']));

        const packed = await packArtifactToV2({artifactDir: dir, jsonlPath: jsonl, dimension: FIXTURE_DIMENSION});

        fs.writeFileSync(path.join(dir, ARTIFACT_META_FILENAME), JSON.stringify({
            artifactVersion: ARTIFACT_SCHEMA_VERSION,
            dimension      : FIXTURE_DIMENSION,
            recordCount    : packed.recordCount,
            vectorEncoding : 'fp16',
            vectorDigest   : packed.vectorDigest,
            byteOrder      : packed.byteOrder,
            ...metaOverrides
        }));

        if (dropSidecar) {
            fs.rmSync(path.join(dir, ARTIFACT_VECTORS_FILENAME), {force: true});
        }
        if (extraJsonl) {
            fs.writeFileSync(path.join(dir, `${KB_BACKUP_FILE_PREFIX}${label}-second.jsonl`), jsonlFixture(['kb-9']));
        }

        return {dir, jsonl, packed}
    };

    test('a v2 artifact with a MISSING sidecar throws — it never imports as vectorless v1', async () => {
        // The finding this closes: schema state was inferred from sidecar PRESENCE, so a v2 artifact
        // that lost its sidecar returned {rehydrated:false} and the import proceeded with every record
        // carrying NO embedding — silent, total vector loss reported as success.
        const {dir} = await stageV2({label: 'missing-sidecar', dropSidecar: true});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/declares schema version 2 but .* is missing[\s\S]*NO embedding/);
    });

    test('a v1 stamp carrying a sidecar throws rather than choosing which half to believe', async () => {
        const {dir} = await stageV2({label: 'contradiction', metaOverrides: {artifactVersion: 1}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/declares artifactVersion 1 but carries/);
    });

    test('an artifact from a NEWER producer throws instead of half-decoding', async () => {
        const {dir} = await stageV2({label: 'future-version', metaOverrides: {artifactVersion: ARTIFACT_SCHEMA_VERSION + 1}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/declares schema version 3; this consumer understands 2/);
    });

    test('a foreign vectorEncoding is refused, not decoded as fp16 anyway', async () => {
        const {dir} = await stageV2({label: 'encoding', metaOverrides: {vectorEncoding: 'fp32'}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/vectorEncoding 'fp32'/);
    });

    test('a v2 artifact WITHOUT a digest is refused — the digest is mandatory, not optional', async () => {
        // Previously `if (vectorDigest && …)`, so omitting it skipped the order proof entirely: the one
        // check that catches a permutation was disabled by leaving a field out.
        const {dir} = await stageV2({label: 'no-digest', metaOverrides: {vectorDigest: undefined}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/without a 'vectorDigest'/);
    });

    test('a foreign wire byte order is refused rather than read as noise', async () => {
        const {dir} = await stageV2({label: 'byte-order', metaOverrides: {byteOrder: 'big-endian'}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/byteOrder 'big-endian'/);
    });

    test('TWO KB JSONLs are refused — the row-set the sidecar describes must be singular', async () => {
        // Positional pairing against "whichever file matched first" is a silent choice, not a tie-break.
        const {dir} = await stageV2({label: 'two-jsonl', extraJsonl: true});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/Expected exactly one .* found 2/);
        await expect(resolveSingleArtifactJsonl({artifactDir: dir}))
            .rejects.toThrow(/Refusing to guess which row-set/);
    });

    test('the wire byte order is pinned little-endian and stamped by the packer', async () => {
        const {packed} = await stageV2({label: 'order-stamp'});

        expect(ARTIFACT_VECTOR_BYTE_ORDER).toBe('little-endian');
        expect(packed.byteOrder).toBe(ARTIFACT_VECTOR_BYTE_ORDER);
    });

    test('the sidecar holds CANONICAL little-endian bytes for known fp16 values', async () => {
        // A same-host round-trip cannot see a byte-order defect: producer and consumer are wrong together
        // and agree. Only a known-value byte assertion pins the wire. 1 = 0x3C00, -2 = 0xC000,
        // 0.5 = 0x3800; little-endian puts the low byte first, so the file must read 00 3c 00 c0 00 38.
        const dir   = path.join(workRoot, 'canonical-bytes'),
              jsonl = path.join(dir, `${KB_BACKUP_FILE_PREFIX}bytes.jsonl`);

        await fsExtra.ensureDir(dir);
        fs.writeFileSync(jsonl, JSON.stringify({id: 'kb-1', embedding: [1, -2, 0.5], metadata: {}}) + '\n');

        await packArtifactToV2({artifactDir: dir, jsonlPath: jsonl, dimension: 3});

        expect(fs.readFileSync(path.join(dir, ARTIFACT_VECTORS_FILENAME)).toString('hex')).toBe('003c00c00038');
    });

    test('rehydrate emits the SHORTEST spelling that re-quantizes to the identical fp16', () => {
        // The size defect this closes: rehydrating widens each fp16 to a double, and JSON.stringify
        // emits the shortest decimal for THAT DOUBLE — the fp16 spelled out in full. Known values,
        // pinned like the canonical-bytes fixture above, because a same-corpus round-trip cannot see
        // a spelling regression: producer and consumer agree either way, only the byte count moves.
        const probe    = new Float16Array(1),
              quantize = value => {probe[0] = value; return probe[0]};

        // 0.1 is the headline case: 13 characters of pure encoding waste, per value, per record.
        expect(quantize(0.1)).toBe(0.0999755859375);
        expect(shortestFp16Decimal(quantize(0.1))).toBe(0.1);

        // Boundaries, because a naive precision loop breaks at the extremes rather than in the middle:
        // fp16 max, the smallest normal, and the smallest subnormal.
        expect(shortestFp16Decimal(quantize(65504))).toBe(65500);
        expect(shortestFp16Decimal(quantize(6.103515625e-5))).toBe(0.00006104);
        expect(shortestFp16Decimal(quantize(5.960464477539063e-8))).toBe(6e-8);

        // Exactly-representable values must not be "shortened" into a different number.
        for (const exact of [0.25, 0.5, 1, -1, -2]) {
            expect(shortestFp16Decimal(quantize(exact))).toBe(exact)
        }
    });

    test('every re-spelled value re-quantizes to the IDENTICAL fp16 — bit-exact, not merely close', () => {
        // This is the property that makes a recall measurement unnecessary rather than skipped: the
        // vectors an adopter imports are bit-identical under both emits, so recall cannot move. A
        // tolerance-based assertion would pass on a lossy rounding that silently shifted the corpus.
        const probe   = new Float16Array(1),
              samples = new Float16Array(4096);

        // Deterministic spread over the representable range — no Math.random(), so a failure reproduces.
        for (let i = 0; i < samples.length; i++) {
            samples[i] = Math.sin(i * 0.7331) * Math.pow(2, (i % 24) - 12)
        }

        let respelled = 0;

        for (const value of samples) {
            const short = shortestFp16Decimal(value);

            probe[0] = short;

            // Object.is, not toBe-with-tolerance and not ===: fp16 carries a signed zero, and
            // `-0 === 0` would accept a flipped sign bit as a match.
            expect(Object.is(probe[0], value)).toBe(true);

            if (!Object.is(short, value)) respelled++
        }

        // The fixture must actually exercise re-spelling, or the assertion above is vacuous —
        // a suite of already-shortest values would pass without testing anything.
        expect(respelled).toBeGreaterThan(samples.length / 2)
    });

    test('the ONE exception is negative zero, and it is JSON that loses it — not this function', () => {
        // The deterministic spread above cannot reach -0, so the invariant it proves is
        // "every finite fp16 EXCEPT -0". Pinning the exception explicitly, because an invariant
        // with a silent carve-out is the shape that gets quoted without its condition.
        const probe = new Float16Array(1);

        probe[0] = -0;

        // The function preserves it: `Object.is` refuses `+0` as a spelling of `-0`, so the loop
        // exhausts its precisions and returns the original rather than widening the carve-out.
        expect(Object.is(shortestFp16Decimal(probe[0]), -0)).toBe(true);

        // …and serialization loses it anyway. This is a property of JSON, and it means any
        // "bit-exact JSON round-trip" claim in this file carries exactly this one exception.
        expect(JSON.stringify(-0)).toBe('0');
        expect(Object.is(JSON.parse(JSON.stringify(-0)), -0)).toBe(false);

        // Harmless for retrieval, asserted rather than claimed: a ±0 component contributes the
        // same term to a dot product, so the flip cannot move a similarity score.
        expect(-0 * 0.5 + 1).toBe(0 * 0.5 + 1)
    });

    test('a v2 artifact with NO byteOrder stamp is refused, not assumed to match this host', async () => {
        // Defaulting an absent stamp re-creates the exact failure the gate exists to prevent — the consumer
        // assumes the order it happens to run on. The Contract Ledger says required; so must the code.
        const {dir} = await stageV2({label: 'absent-order', metaOverrides: {byteOrder: undefined}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/without a 'byteOrder'/);
    });

    test('a STRING dimension is refused — truthiness is not a geometry check', async () => {
        // `dimension: "3"` is truthy and coerces through the multiplication, so the byte-length check would
        // pass on a JSON-typed field slip. Strict integers close it.
        const {dir} = await stageV2({label: 'string-dim', metaOverrides: {dimension: `${FIXTURE_DIMENSION}`}});

        await expect(rehydrateArtifactFromV2({artifactDir: dir}))
            .rejects.toThrow(/'dimension' must be a positive integer, got "4" \(string\)/);
    });

    test('pack STREAMS the JSONL and never reads it whole', async () => {
        // The defect this closes could not be seen by any small fixture: the old implementation read the
        // whole JSONL into ONE utf-8 string, and the real 2.81 GiB export is 5.62x Node's
        // MAX_STRING_LENGTH (536,870,888) — so the shipped path threw ERR_STRING_TOO_LONG on the corpus
        // it was written for while passing every 3-row test.
        //
        // This asserts the MECHANISM, not a memory reading. The previous version bounded
        // `process.memoryUsage().rss` growth at `jsonlBytes * 4`, and that instrument could never
        // decide this question: measured on the real packer, the STREAMING path costs 4-17x the file
        // in RSS (transient fp16/batch buffers plus V8 heap growth, none of which is returned), while
        // a whole-file read costs only ~1.4-2.7x. So the "bad" implementation sat comfortably under a
        // bound the good one exceeded, and what the arm actually sampled was process history — the
        // same call reads ~7.4 MB cold and ~1.8 MB warm, which is why it reddened unrelated PRs.
        //
        // A stream read and a whole-file read are distinguishable exactly, so the arm asks that.
        const dir   = path.join(workRoot, 'stream-bound'),
              jsonl = path.join(dir, `${KB_BACKUP_FILE_PREFIX}stream.jsonl`),
              ids   = Array.from({length: 4000}, (_, i) => `kb-${i}`);

        await fsExtra.ensureDir(dir);
        fs.writeFileSync(jsonl, jsonlFixture(ids));

        // Patched on `fs-extra`, which is what the implementation imports as its `fs`. Patching
        // node:fs here would observe nothing and the arm would be vacuous.
        const originals     = {createReadStream: fsExtra.createReadStream, readFileSync: fsExtra.readFileSync},
              streamedFrom  = [],
              readWholeFrom = [];

        fsExtra.createReadStream = (target, ...rest) => {
            streamedFrom.push(String(target));
            return originals.createReadStream(target, ...rest)
        };

        fsExtra.readFileSync = (target, ...rest) => {
            readWholeFrom.push(String(target));
            return originals.readFileSync(target, ...rest)
        };

        let packed;

        try {
            packed = await packArtifactToV2({artifactDir: dir, jsonlPath: jsonl, dimension: FIXTURE_DIMENSION});
        } finally {
            Object.assign(fsExtra, originals)
        }

        expect(packed.recordCount).toBe(4000);
        // Sidecar size is exact arithmetic, so a streaming bug that dropped or duplicated a row shows here.
        expect(fs.statSync(path.join(dir, ARTIFACT_VECTORS_FILENAME)).size).toBe(4000 * FIXTURE_DIMENSION * 2);

        // The JSONL is opened as a stream …
        expect(streamedFrom, 'the JSONL is read through a stream').toContain(jsonl);
        // … and never slurped whole. This is the assertion that fails if the implementation reverts.
        expect(readWholeFrom, 'the JSONL is never read as one string').not.toContain(jsonl);
    });

    test('a REORDERED v2 JSONL aborts the real download BEFORE any import runs', async () => {
        // The digest guard is only worth anything if it is reachable through the shipped path. This
        // permutes the JSONL inside a real zip: same ids, same record count, and a sidecar of exactly
        // the right byte length — the corruption no shape check can see.
        const {fetchImpl} = await buildServedArtifact({
            label      : 'reordered',
            ids        : ['kb-1', 'kb-2', 'kb-3'],
            mutateStage: async ({servedZip, releaseRoot}) => {
                const tamperDir = path.join(releaseRoot, 'tamper');

                await fsExtra.ensureDir(tamperDir);
                await unzipTo(servedZip, tamperDir);

                const jsonlName = fs.readdirSync(tamperDir).find(entry => entry.endsWith('.jsonl')),
                      jsonlPath = path.join(tamperDir, jsonlName),
                      lines     = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);

                fs.writeFileSync(jsonlPath, [lines[0], lines[2], lines[1]].join('\n') + '\n');
                fs.rmSync(servedZip, {force: true});

                await zipFlat(servedZip, [jsonlPath, path.join(tamperDir, ARTIFACT_META_FILENAME), path.join(tamperDir, ARTIFACT_VECTORS_FILENAME)]);
            }
        });

        const downloadDbSeam = makeDatabaseServiceSeam({importResult: {message: 'ok', imported: 3, mode: 'merge'}});

        const result = await downloadKnowledgeBase({
            tagName         : '99.0.0',
            chromaManager   : {getKnowledgeBaseCollection: async () => ({count: async () => 0})},
            databaseService : downloadDbSeam,
            lifecycleService: readyLifecycleSeam(),
            embeddingConfig : {embeddingProvider: 'openAiCompatible', vectorDimension: FIXTURE_DIMENSION},
            fetchImpl,
            workRoot        : path.join(workRoot, 'dl-reordered'),
            logger          : silentLogger
        });

        // Soft-fail (npm install must never break) but the import NEVER ran — the alternative is
        // ingesting 3 records each paired with another record's embedding.
        expect(result.status).toBe('error');
        expect(result.reason).toMatch(/does not match the stamped vector digest/);
        expect(downloadDbSeam.calls.filter(call => call.action === 'import')).toHaveLength(0);
    });
});
