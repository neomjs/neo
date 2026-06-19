import {execFile} from 'child_process';
import fs         from 'fs-extra';
import os         from 'os';
import path       from 'path';
import {promisify} from 'util';
import {test, expect} from '@playwright/test';
import {
    auditChromaVectorCoverage,
    classifySqliteCheck,
    compareMetadataToVectorIds,
    countFailedApiSteps,
    DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE,
    DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE,
    normalizeExportabilitySampleSize,
    normalizeVectorCoverageSampleSize,
    probeCollection,
    probeStoredEmbeddingExportability,
    resolveCollectionNames,
    resolveSqlitePath
} from '../../../../../../ai/scripts/maintenance/checkChromaIntegrity.mjs';

const execFileAsync = promisify(execFile);

test.describe('checkChromaIntegrity maintenance helpers', () => {
    test('classifies SQLite pragma output strictly', () => {
        expect(classifySqliteCheck('ok\n')).toEqual({
            ok    : true,
            output: 'ok'
        });

        expect(classifySqliteCheck('malformed inverted index for FTS5 table main.embedding_fulltext_search\n')).toEqual({
            ok    : false,
            output: 'malformed inverted index for FTS5 table main.embedding_fulltext_search'
        });
    });

    test('resolves the default Chroma SQLite path from the Memory Core config', () => {
        const sqlitePath = resolveSqlitePath({
            memoryCoreConfig: {
                engines: {
                    chroma: {
                        dataDir: '/tmp/neo-chroma'
                    }
                }
            }
        });

        expect(sqlitePath).toBe('/tmp/neo-chroma/chroma.sqlite3');
    });

    test('uses the configured KB and MC collection names', () => {
        expect(resolveCollectionNames({
            knowledgeBaseConfig: {
                collectionName: 'kb'
            },
            memoryCoreConfig: {
                collections: {
                    memory : 'memory',
                    session: 'sessions',
                    graph  : 'graph'
                }
            }
        })).toEqual(['kb', 'memory', 'sessions', 'graph']);
    });

    test('counts failed API probe steps', () => {
        expect(countFailedApiSteps([{
            steps: [{ok: true}, {ok: false}]
        }, {
            steps: [{ok: false}, {ok: false}]
        }])).toBe(3);
    });

    test('normalizes invalid exportability sample sizes to the default', () => {
        expect(normalizeExportabilitySampleSize('3')).toBe(3);
        expect(normalizeExportabilitySampleSize('0')).toBe(
            DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
        );
        expect(normalizeExportabilitySampleSize('bad')).toBe(
            DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
        );
    });

    test('normalizes invalid vector coverage sample sizes to the default', () => {
        expect(normalizeVectorCoverageSampleSize('2')).toBe(2);
        expect(normalizeVectorCoverageSampleSize('0')).toBe(
            DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE
        );
        expect(normalizeVectorCoverageSampleSize('bad')).toBe(
            DEFAULT_VECTOR_COVERAGE_SAMPLE_SIZE
        );
    });

    test('compares metadata rows to vector index ids with bounded drift samples', () => {
        expect(compareMetadataToVectorIds({
            metadataIds: ['a', 'b', 'c', 'd'],
            vectorIds  : ['a', 'b', 'extra-1', 'extra-2'],
            sampleSize : 1
        })).toEqual({
            metadataRowCount       : 4,
            vectorIndexIdCount     : 4,
            overlapCount           : 2,
            missingFromVectorCount : 2,
            extraInVectorCount     : 2,
            missingFromVectorSample: ['c'],
            extraInVectorSample    : ['extra-1']
        });
    });

    test('reports stored-embedding exportability failures per sampled id', async () => {
        const collection = {
            async get(options) {
                if (options.limit) {
                    return {
                        ids: ['good-a', 'bad', 'good-b']
                    }
                }

                if (options.ids[0] === 'bad') {
                    throw new Error('Error finding id')
                }

                return {
                    ids       : options.ids,
                    embeddings: [[0.1, 0.2]]
                }
            }
        };

        const result = await probeStoredEmbeddingExportability({
            collection,
            sampleSize: 3
        });

        expect(result).toEqual({
            label: 'stored embedding exportability',
            ok   : false,
            value: {
                sampled  : 3,
                succeeded: 2,
                failed   : 1,
                failures : [{
                    id   : 'bad',
                    error: 'Error finding id'
                }]
            }
        });
    });

    test('treats empty collections as exportable with zero sampled ids', async () => {
        const collection = {
            async get() {
                return {
                    ids: []
                }
            }
        };

        await expect(probeStoredEmbeddingExportability({
            collection,
            sampleSize: 3
        })).resolves.toEqual({
            label: 'stored embedding exportability',
            ok   : true,
            value: {
                sampled  : 0,
                succeeded: 0,
                failed   : 0,
                failures : []
            }
        });
    });

    test('includes stored exportability when a collection has no ids', async () => {
        const collection = {
            async count() {
                return 0
            },
            async get() {
                return {
                    ids: []
                }
            }
        };

        const result = await probeCollection({
            collection,
            name: 'empty'
        });

        expect(result.steps.map(step => [step.label, step.ok])).toEqual([
            ['count', true],
            ['get ids limit 1', true],
            ['stored embedding exportability', true]
        ]);
    });

    test('keeps stored exportability separate from query health', async () => {
        const collection = {
            async count() {
                return 2
            },
            async get(options) {
                if (options.limit) {
                    return {
                        ids: ['good', 'bad']
                    }
                }

                if (options.ids[0] === 'bad') {
                    throw new Error('Error finding id')
                }

                return {
                    ids       : options.ids,
                    documents : ['doc'],
                    embeddings: [[0.1, 0.2]],
                    metadatas : [{}]
                }
            },
            async query() {
                return {
                    ids      : [['good']],
                    distances: [[0]]
                }
            }
        };

        const result = await probeCollection({
            collection,
            name                   : 'memory',
            exportabilitySampleSize: 2
        });

        expect(result.steps.map(step => [step.label, step.ok])).toEqual([
            ['count', true],
            ['get ids limit 1', true],
            ['get metadata/document by id', true],
            ['get embedding by id', true],
            ['stored embedding exportability', false],
            ['query by existing embedding', true]
        ]);
    });

    test('audits exact vector coverage with duplicate collection rows and missing pickle files', async () => {
        const tmpDir     = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-chroma-coverage-')),
              sqlitePath = path.join(tmpDir, 'chroma.sqlite3'),
              vectorDir  = path.join(tmpDir, 'vec-a'),
              picklePath = path.join(vectorDir, 'index_metadata.pickle');

        try {
            await fs.ensureDir(vectorDir);

            await execFileAsync('sqlite3', [sqlitePath, `
                create table collections (
                    id text primary key,
                    name text not null,
                    dimension integer,
                    database_id text not null
                );
                create table segments (
                    id text primary key,
                    type text not null,
                    scope text not null,
                    collection text not null
                );
                create table embeddings (
                    id integer primary key,
                    segment_id text not null,
                    embedding_id text not null,
                    seq_id blob not null,
                    created_at timestamp not null default current_timestamp,
                    unique(segment_id, embedding_id)
                );
                insert into collections (id, name, dimension, database_id) values
                    ('collection-a', 'neo-native-graph', 4096, 'db-a'),
                    ('collection-b', 'neo-native-graph', 4096, 'db-b');
                insert into segments (id, type, scope, collection) values
                    ('meta-a', 'urn:chroma:segment/metadata/sqlite', 'METADATA', 'collection-a'),
                    ('vec-a', 'urn:chroma:segment/vector/hnsw-local-persisted', 'VECTOR', 'collection-a'),
                    ('meta-b', 'urn:chroma:segment/metadata/sqlite', 'METADATA', 'collection-b'),
                    ('vec-missing', 'urn:chroma:segment/vector/hnsw-local-persisted', 'VECTOR', 'collection-b');
                insert into embeddings (segment_id, embedding_id, seq_id) values
                    ('meta-a', 'a', x'01'),
                    ('meta-a', 'b', x'02'),
                    ('meta-a', 'c', x'03'),
                    ('meta-a', 'missing', x'04'),
                    ('meta-b', 'orphan', x'05');
            `]);

            const pickleScript = [
                'import json, pickle, sys',
                'ids = json.loads(sys.argv[2])',
                'data = {"id_to_label": {id_: index for index, id_ in enumerate(ids)}}',
                'with open(sys.argv[1], "wb") as handle:',
                '    pickle.dump(data, handle)'
            ].join('\n');

            await execFileAsync('python3', [
                '-c',
                pickleScript,
                picklePath,
                JSON.stringify(['a', 'b', 'c', 'extra'])
            ]);

            const result = await auditChromaVectorCoverage({
                snapshotPath   : sqlitePath,
                persistDir     : tmpDir,
                collectionNames: ['neo-native-graph'],
                sampleSize     : 2
            });

            expect(result.duplicateCollectionNames).toEqual([{
                name         : 'neo-native-graph',
                collectionIds: ['collection-a', 'collection-b']
            }]);
            expect(result.failedCollections).toBe(2);

            const primary = result.collections.find(row => row.collectionId === 'collection-a');
            expect(primary).toMatchObject({
                name                   : 'neo-native-graph',
                metadataSegmentId      : 'meta-a',
                vectorSegmentId        : 'vec-a',
                duplicateCollectionName: true,
                ok                     : false,
                metadataRowCount       : 4,
                vectorIndexIdCount     : 4,
                overlapCount           : 3,
                missingFromVectorCount : 1,
                extraInVectorCount     : 1,
                missingFromVectorSample: ['missing'],
                extraInVectorSample    : ['extra']
            });

            const missing = result.collections.find(row => row.collectionId === 'collection-b');
            expect(missing).toMatchObject({
                duplicateCollectionName: true,
                ok                     : false,
                metadataRowCount       : 1,
                vectorIndexIdCount     : 0,
                missingFromVectorCount : 1,
                extraInVectorCount     : 0,
                missingFromVectorSample: ['orphan'],
                extraInVectorSample    : []
            });
            expect(missing.error).toContain('Vector index metadata file not found');
        } finally {
            await fs.remove(tmpDir);
        }
    });
});
