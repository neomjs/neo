import {test, expect} from '@playwright/test';
import {
    classifySqliteCheck,
    countFailedApiSteps,
    DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE,
    normalizeExportabilitySampleSize,
    probeCollection,
    probeStoredEmbeddingExportability,
    resolveCollectionNames,
    resolveSqlitePath
} from '../../../../../../ai/scripts/maintenance/checkChromaIntegrity.mjs';

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
});
