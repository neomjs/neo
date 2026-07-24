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
            recordOrderDigest
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
